/** iLink 客户端测试：验证长轮询请求、Authorization 和游标字段，不访问真实微信。 */

import { describe, expect, it, vi } from 'vitest'
import { IlinkClient } from '../src/api/ilinkClient.ts'

describe('IlinkClient', () => {
  it('sends getUpdates with the stored cursor and bearer token', async () => {
    const fetch_impl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.method).toBe('POST')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
      expect(JSON.parse(String(init?.body)).get_updates_buf).toBe('cursor-a')
      return new Response(JSON.stringify({ ret: 0, msgs: [], get_updates_buf: 'cursor-b' }), { status: 200 })
    })
    const client = new IlinkClient({ base_url: 'https://example.test', token: 'test-token', fetch_impl })
    await expect(client.get_updates('cursor-a')).resolves.toEqual({ ret: 0, msgs: [], get_updates_buf: 'cursor-b' })
    expect(fetch_impl).toHaveBeenCalledTimes(1)
  })

  it('uploads encrypted media and sends an image item', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetch_impl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      calls.push({ url, ...init === undefined ? {} : { init } })
      if (url.endsWith('/ilink/bot/getuploadurl')) return new Response(JSON.stringify({ upload_full_url: 'https://cdn.test/upload' }))
      if (url === 'https://cdn.test/upload') return new Response('', { status: 200, headers: { 'x-encrypted-param': 'download-param' } })
      return new Response(JSON.stringify({ ret: 0 }), { status: 200 })
    })
    const client = new IlinkClient({ base_url: 'https://example.test', cdn_base_url: 'https://cdn.test', token: 'test-token', random_uin: 'uin', fetch_impl })
    await client.send_image({ to_user_id: 'user-1', data: Uint8Array.from([1, 2, 3]), context_token: 'ctx' })
    expect(calls.map(call => call.url)).toEqual([
      'https://example.test/ilink/bot/getuploadurl',
      'https://cdn.test/upload',
      'https://example.test/ilink/bot/sendmessage',
    ])
    const body = JSON.parse(String(calls[2]?.init?.body)) as { msg: { item_list: Array<{ type?: number; image_item?: { media?: { encrypt_query_param?: string } } }> } }
    expect(body.msg.item_list[0]?.image_item?.media?.encrypt_query_param).toBe('download-param')
  })

  it('retries a transient send failure with the same client id', async () => {
    const bodies: string[] = []
    let attempts = 0
    const fetch_impl = vi.fn<typeof fetch>(async (_input, init) => {
      attempts += 1
      bodies.push(String(init?.body))
      if (attempts === 1) return new Response(JSON.stringify({ ret: 500, errmsg: 'temporary' }), { status: 200 })
      return new Response(JSON.stringify({ ret: 0 }), { status: 200 })
    })
    const client = new IlinkClient({ base_url: 'https://example.test', token: 'test-token', send_retry_delay_ms: 0, fetch_impl })
    await client.send_message_with_retry({ to_user_id: 'user-1', text: 'retry me' })
    expect(attempts).toBe(2)
    expect(JSON.parse(bodies[0]!).msg.client_id).toBe(JSON.parse(bodies[1]!).msg.client_id)
  })
})
