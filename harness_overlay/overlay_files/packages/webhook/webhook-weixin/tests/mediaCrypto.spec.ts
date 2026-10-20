/** 媒体加密测试：验证 OpenClaw 微信插件使用的 AES-128-ECB 解密兼容性。 */

import { createCipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt_aes_ecb, parse_aes_key } from '../src/media/mediaCrypto.ts'

describe('mediaCrypto', () => {
  it('decrypts AES-128-ECB bytes and parses raw/base64-hex keys', () => {
    const key = Buffer.from('0123456789abcdef')
    const cipher = createCipheriv('aes-128-ecb', key, null)
    const encrypted = Buffer.concat([cipher.update(Buffer.from('微信媒体 fixture')), cipher.final()])
    expect(decrypt_aes_ecb(encrypted, key).toString()).toBe('微信媒体 fixture')
    expect(parse_aes_key(key.toString('base64'))).toEqual(key)
    expect(parse_aes_key(Buffer.from(key.toString('hex')).toString('base64'))).toEqual(key)
  })
})
