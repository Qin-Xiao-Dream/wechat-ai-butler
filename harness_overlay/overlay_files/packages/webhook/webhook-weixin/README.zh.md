# Harness 微信 iLink 适配器

本包抽取 OpenClaw 微信插件的 iLink 协议和媒体处理，并通过 Harness Agent Registry 复用、恢复和销毁会话。协议层不依赖 OpenClaw Runtime；会话层只使用 Harness 原生 Agent、Session 和 Cordis 生命周期。

配置中的 `tokenRef` 只表示凭据引用，不保存 Token 明文。真实部署应由宿主凭据服务解析引用后创建 `IlinkClient`。
