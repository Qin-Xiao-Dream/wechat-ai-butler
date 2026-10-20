/** 微信消息规范化测试：覆盖文本、图片、语音文本优先级和无文本语音标记。 */

import { describe, expect, it } from 'vitest'
import { MessageNormalizer } from '../src/message/messageNormalizer.ts'

describe('MessageNormalizer', () => {
  it('uses voice_item.text before audio media', () => {
    const message = new MessageNormalizer().normalize_message({
      message_id: 7,
      from_user_id: 'user-a',
      item_list: [{ type: 3, voice_item: { text: '微信提供的文字' } }],
    })
    expect(message.text).toBe('微信提供的文字')
    expect(message.media).toHaveLength(0)
  })

  it('retains an audio marker when voice text is absent', () => {
    const message = new MessageNormalizer().normalize_message({
      seq: 8,
      from_user_id: 'user-a',
      item_list: [{ type: 3, voice_item: { playtime: 1200 } }],
    })
    expect(message.text).toBe('')
    expect(message.media).toEqual([{ kind: 'voice', mime_type: 'audio/silk', source_text: 'voice_media_requires_asr' }])
  })

  it('normalizes text and image in source order', () => {
    const message = new MessageNormalizer().normalize_message({
      message_id: 9,
      from_user_id: 'user-a',
      item_list: [
        { type: 1, text_item: { text: '请看图' } },
        { type: 2, image_item: { url: 'fixture' } },
      ],
    })
    expect(message.text).toBe('请看图')
    expect(message.media[0]?.kind).toBe('image')
  })
})
