# DeepSeek Harness Weixin Webhook

This package extracts the Weixin iLink transport and adapts it to the native Harness Agent and Session lifecycle. It keeps one durable route per Weixin user, serializes turns per user, resumes persisted sessions, persists inbound media through `ctx.attachments`, and sends committed assistant text back through iLink.

## Model Experience

The adapter does not select or transform a model. `provider`, `model`, and `reasoning_effort` are passed to the native Harness Agent. Token accounting remains owned by the selected Harness LLM adapter; this package adds no prompt or cache layer.

## Known Limitations and Deferred Work

- Voice media without `voice_item.text` is retained as media metadata and requires an explicit ASR provider before transcription is available.
- The current reply bridge sends one committed final text message. Progress-message streaming can be added through the same iLink sender without changing session ownership.
- The package does not store credentials; deployers must provide the token through a secret-aware configuration layer.
- Outbound text replies use a bounded retry policy (two retries by default) with a stable `client_id`; configure `send_retry_count` and `send_retry_delay_ms` at deployment time.
