/**
 * 模型故障转移：错误分类、候选顺序、健康表冷却。
 *
 * **重建说明**：本文件是公开仓库 `wechat-ai-butler` 的 overlay 快照里缺失的一个模块
 * （MANIFEST 记 85 个文件，实际交付 83 个；`runtime/weixinConnector.ts` 与本文件都未随仓库发布）。
 * 本实现依据同仓库的 `tests/modelFailover.spec.ts` 规格与 `runtime/weixinConnector.ts` 的调用点重建，
 * 行为以测试为准。若日后拿到原件，直接覆盖本文件即可。
 *
 * @module dsh-webhook-weixin/model-failover
 */

import { existsSync } from 'node:fs'

/** 换模型的四类理由；网络抖动/5xx/超时**不**在此列（交给 harness 自己重试）。 */
export type FailoverReason = 'quota' | 'rate_limit' | 'auth' | 'model_missing'

/** 一个"provider + 模型 id"的候选。 */
export interface ModelCandidate {
  provider: string
  model: string
}

/** `modelConfig.json` 的 `failover` 段解析结果。 */
export interface FailoverConfig {
  enabled: boolean
  order: ModelCandidate[]
  /** 额度类冷却时长（毫秒），缺省 1 小时。 */
  cooldownMs: number
}

/** 健康表里的一条记录。 */
export interface DeadModel extends ModelCandidate {
  reason: FailoverReason
  detail: string
  /** 冷却到期的绝对时间戳（毫秒）。 */
  until: number
}

const DEFAULT_COOLDOWN_MS = 60 * 60_000
const RATE_LIMIT_COOLDOWN_MS = 3 * 60_000
const AUTH_COOLDOWN_MS = 24 * 60 * 60_000
const MODEL_MISSING_COOLDOWN_MS = 24 * 60 * 60_000

/** 判定"本地模型"：不参与故障转移（它与云端模型分工，不互为备份）。 */
function is_local_provider(provider_id: string, provider: unknown): boolean {
  if (/local/i.test(provider_id)) return true
  const models = (provider as { models?: Array<{ pricing?: { free?: unknown } }> } | undefined)?.models
  if (Array.isArray(models)) {
    return models.some(item => item?.pricing?.free === true)
  }
  return false
}

/**
 * 找模型配置文件：优先 `config/` 子目录（真实部署就在那儿），其次工作区根目录。
 *
 * @returns 命中的绝对/相对路径；都没有则 `undefined`，调用方据此报"配置缺失"。
 */
export function find_model_config(workspace: string): string | undefined {
  const nested = join_path(workspace, 'config', 'modelConfig.json')
  if (file_exists(nested)) return nested
  const root = join_path(workspace, 'modelConfig.json')
  if (file_exists(root)) return root
  return undefined
}

/** 分类模型调用失败；返回 undefined 表示"不换模型"。 */
export function classify_llm_failure(detail: string): FailoverReason | undefined {
  const text = String(detail ?? '')
  const lower = text.toLowerCase()

  // ① 额度类必须最先判：它的 type 有时也叫 rate_limit_exceeded（如 "日限额已用完"）。
  if (
    /限额/.test(text)
    || /余额不足|欠费|充值/.test(text)
    || /quota/.test(lower)
    || /insufficient[_ ]?(quota|balance)/.test(lower)
    || /exceeded your current quota/.test(lower)
  ) {
    return 'quota'
  }

  // ② 限流/并发满：几秒到几分钟就能恢复，不该按小时拉黑。
  if (
    /too many requests/.test(lower)
    || /rate[_ ]?limit(?!_exceeded)/.test(lower)
    || /concurren/.test(lower)
    || /overloaded/.test(lower)
    || /服务繁忙|稍后重试|并发/.test(text)
    || /\b429\b/.test(text)
  ) {
    return 'rate_limit'
  }

  // ③ 模型不存在/下线。
  if (
    /model[_ ]?not[_ ]?found/.test(lower)
    || /does not exist/.test(lower)
    || /no such model/.test(lower)
    || /模型.*(不存在|下线|已废弃)/.test(text)
  ) {
    return 'model_missing'
  }

  // ④ 鉴权：key 无效/失效。放在 403 并发判断之后，避免"并发满"被长期拉黑。
  if (
    /\b401\b/.test(text)
    || /unauthorized/.test(lower)
    || /invalid[_ ]?api[_ ]?key/.test(lower)
    || /incorrect api key/.test(lower)
    || /key.*(失效|无效|不正确)/.test(text)
    || /\b403\b/.test(text)
  ) {
    return 'auth'
  }

  // 网络抖动、5xx、超时、流中断：不换模型。
  return undefined
}

/** 按理由给冷却时长。 */
export function cooldown_ms(reason: FailoverReason, failover: FailoverConfig): number {
  switch (reason) {
    case 'rate_limit': return RATE_LIMIT_COOLDOWN_MS
    case 'auth': return AUTH_COOLDOWN_MS
    case 'model_missing': return MODEL_MISSING_COOLDOWN_MS
    case 'quota': return failover.cooldownMs ?? DEFAULT_COOLDOWN_MS
  }
}

/**
 * 解析 `failover` 段：
 * - 显式 `order` 优先，但指向已删除 provider/模型的条目会被丢掉（不留悬空引用）；
 * - 否则默认模型打头，其余按 `providers` 的出现顺序跟上，本地模型不参与。
 */
export function parse_failover_config(config: unknown): FailoverConfig {
  const root = (config ?? {}) as {
    defaultModel?: { provider?: unknown, model?: unknown }
    providers?: Record<string, { models?: Array<{ id?: unknown }> }>
    failover?: { enabled?: unknown, order?: unknown, cooldownMs?: unknown }
  }
  const providers = root.providers ?? {}
  const enabled = root.failover?.enabled !== false
  const cooldownMs = typeof root.failover?.cooldownMs === 'number' && root.failover.cooldownMs > 0
    ? root.failover.cooldownMs
    : DEFAULT_COOLDOWN_MS

  /** 该 provider 是否真的声明了这个模型 id。 */
  const model_exists = (provider_id: string, model_id: string): boolean => {
    const provider = providers[provider_id]
    if (provider === undefined) return false
    const models = Array.isArray(provider.models) ? provider.models : []
    return models.some(item => item?.id === model_id)
  }

  const explicit = Array.isArray(root.failover?.order) ? root.failover?.order as unknown[] : undefined
  if (explicit !== undefined) {
    const order: ModelCandidate[] = []
    for (const raw of explicit) {
      const item = raw as { provider?: unknown, model?: unknown }
      const provider = typeof item?.provider === 'string' ? item.provider : undefined
      const model = typeof item?.model === 'string' ? item.model : undefined
      if (provider === undefined || model === undefined) continue
      if (!model_exists(provider, model)) continue
      order.push({ provider, model })
    }
    return { enabled, order, cooldownMs }
  }

  const order: ModelCandidate[] = []
  const push = (provider: string, model: string): void => {
    if (order.some(item => item.provider === provider && item.model === model)) return
    order.push({ provider, model })
  }

  const default_provider = typeof root.defaultModel?.provider === 'string' ? root.defaultModel.provider : undefined
  const default_model = typeof root.defaultModel?.model === 'string' ? root.defaultModel.model : undefined
  if (default_provider !== undefined && default_model !== undefined) {
    if (is_local_provider(default_provider, providers[default_provider])) return { enabled, order, cooldownMs }
    if (model_exists(default_provider, default_model)) push(default_provider, default_model)
  }

  for (const [provider_id, provider] of Object.entries(providers)) {
    if (is_local_provider(provider_id, provider)) continue
    for (const model of provider?.models ?? []) {
      const id = typeof model?.id === 'string' ? model.id : undefined
      if (id !== undefined) push(provider_id, id)
    }
  }
  return { enabled, order, cooldownMs }
}

/**
 * 挑下一个还活着的候选：从当前项往后找，末尾回头，跳过失活的；
 * 全都不行则 `undefined`（调用方据此告诉用户"接口都不可用了"）。
 */
export function next_alive_candidate(
  order: ModelCandidate[],
  current: ModelCandidate,
  is_dead: (candidate: ModelCandidate) => boolean,
): ModelCandidate | undefined {
  if (order.length === 0) return undefined
  const current_key = `${current.provider}/${current.model}`
  let start = order.findIndex(item => `${item.provider}/${item.model}` === current_key)
  if (start < 0) start = 0
  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(start + step) % order.length]
    if (candidate === undefined) continue
    if (is_dead(candidate)) continue
    return candidate
  }
  return undefined
}

/** 失活模型的健康表：只记内存，进程重启即清零（重启后本来就该重新试探）。 */
export class ModelHealth {
  private readonly entries = new Map<string, DeadModel>()

  public constructor(private readonly now: () => number = () => Date.now()) {}

  /** 把某个候选拉黑到 `cooldown` 毫秒之后，返回它的记录（含 `until`）。 */
  public mark_dead(
    candidate: ModelCandidate,
    reason: FailoverReason,
    detail: string,
    cooldown: number,
  ): DeadModel {
    const until = this.now() + cooldown
    const entry: DeadModel = {
      provider: candidate.provider,
      model: candidate.model,
      reason,
      detail,
      until,
    }
    this.entries.set(key_of(candidate), entry)
    return entry
  }

  /** 是否仍在冷却期；到期即视为"可以再试"，并顺手清掉过期记录。 */
  public is_dead(candidate: ModelCandidate): boolean {
    this.prune()
    return this.entries.has(key_of(candidate))
  }

  /** 当前仍在冷却期的记录（已被清理的过期项不出现）。 */
  public snapshot(): DeadModel[] {
    this.prune()
    return [...this.entries.values()].map(entry => ({ ...entry }))
  }

  /** 清掉已到期的条目。 */
  private prune(): void {
    const now = this.now()
    for (const [key, entry] of this.entries) {
      if (entry.until <= now) this.entries.delete(key)
    }
  }
}

function key_of(candidate: ModelCandidate): string {
  return `${candidate.provider}/${candidate.model}`
}

/** 轻量路径拼接：避免为了一个小函数引入整个 node:path 类型面。 */
function join_path(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') ? '\\' : '/'
  const trimmed = base.replace(/[\\/]+$/, '')
  return [trimmed, ...parts].join(separator)
}

/** 文件是否存在（同步、只读）。 */
function file_exists(path: string): boolean {
  return existsSync(path)
}
