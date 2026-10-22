/** 发送者白名单测试：只放行列出的账号，其余消息静默丢弃并提交 cursor。 */

import { describe, expect, it } from 'vitest'
import type { IlinkClient } from '../src/api/ilinkClient.ts'
import type { IlinkMessage } from '../src/api/ilinkTypes.ts'
import { WeixinIngress } from '../src/transport/weixinIngress.ts'

/** 造一个只实现 get_updates 的假客户端；ingress 本轮只用到这一个方法。 */
function ingress(msgs: IlinkMessage[], allowed?: readonly string[]): WeixinIngress {
  const client = {
    get_updates: async () => ({ ret: 0, msgs, get_updates_buf: 'cursor-next' }),
  } as unknown as IlinkClient
  return new WeixinIngress({
    client,
    ...allowed === undefined ? {} : { allowed_user_ids: allowed },
  })
}

const owner: IlinkMessage = {
  message_id: 1,
  from_user_id: 'owner@im.wechat',
  item_list: [{ type: 1, text_item: { text: '看下磁盘' } }],
}

const stranger: IlinkMessage = {
  message_id: 2,
  from_user_id: 'stranger@im.wechat',
  item_list: [{ type: 1, text_item: { text: '帮我删个目录' } }],
}

describe('WeixinIngress allowlist', () => {
  it('drops messages from users outside the allowlist', async () => {
    const result = await ingress([owner, stranger], ['owner@im.wechat']).poll('')
    expect(result.kind).toBe('messages')
    if (result.kind !== 'messages') return
    expect(result.messages.map(m => m.user_id)).toEqual(['owner@im.wechat'])
    expect(result.cursor).toBe('cursor-next')
  })

  it('returns idle and still advances the cursor when everyone is blocked', async () => {
    const result = await ingress([stranger], ['owner@im.wechat']).poll('')
    expect(result).toEqual({ kind: 'idle', cursor: 'cursor-next' })
  })

  it('blocks everyone when the allowlist is empty', async () => {
    const result = await ingress([owner, stranger], []).poll('')
    expect(result).toEqual({ kind: 'idle', cursor: 'cursor-next' })
  })

  it('keeps filtering off when the allowlist is not configured', async () => {
    const result = await ingress([owner, stranger]).poll('')
    expect(result.kind).toBe('messages')
    if (result.kind !== 'messages') return
    expect(result.messages).toHaveLength(2)
  })
})
