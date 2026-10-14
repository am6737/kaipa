# #11 旧位置入口封堵（仅准备，未应用）

新版位置完全使用 `journey-location` Edge HTTP 和私有数据库快照，不使用 Realtime 作为发布或分发来源。这个网关封堵旧 `journey-presence:*` Phoenix topic 的所有客户端消息和服务端输出，包括原连接后续的 track，并拒绝旧 topic 的 HTTP broadcast。其他 JSON Phoenix 帧向上游转发；本 App 的现有 Realtime 调用均为 `postgres_changes`，隔离补证已验证两个真实 WS 客户端收到 WAL 更新。**不支持 binary 帧，SDK v2 的 JSON broadcast 也会编码成 binary，不能把它写成所有 Realtime 功能兼容。** 详见 [follow-up](../../../docs/qa/issue-11-followup.md)。不能只把 tenant 改成 private-only：已有公共连接仍可能 track。

运行源文件：`deno run --allow-net --allow-env supabase/functions/realtime-location-guard/server.ts`，`REALTIME_UPSTREAM` 指向**内网** Realtime origin，`PORT` 默认 4001。本 PR 不改现有 compose、Kong、CI 或发布脚本，也不运行此共享变更。

受控启用必须一起完成，不能将只上线新版客户端称为漏洞已关闭：

1. 在维护窗口阻断外部 Realtime ingress（含 WebSocket、HTTP broadcast、其他域名和直连端口），阻止切换期间的新旧连接绕过网关。
2. 在同一私有网络启动本 guard；将所有 Realtime 入口指向 guard，禁止外部直连 upstream。保留原路径映射（Kong 的 `/realtime/v1/websocket` 到 `/socket/websocket`），凭据仍由 Realtime 校验，不在 guard 中生成/存储密钥。
3. **排空原 upstream 连接**：在入口阻断期间受控重启 Realtime，确认旧客户端原 TCP/WS 连接全部断开。仅切换 DNS/路由不会关闭既有 WS。新连接只能经 guard，旧位置 phx_join/track 必须收到 `legacy_location_disabled`。
4. 按自托管工具应用两份新 migration，并通过 `infra/supabase/deploy-functions.sh journey-location resources` 发布函数，再放开经过 guard 的 ingress。用无登录、匿名 Auth、非成员、伪造身份、撤销原会话矩阵验收；核对合法旅程同步与其他 Realtime 订阅。

断网/杀进程时无法即时发 close：服务端租约从最后接受发布起保留 40 秒，到期不再分发或接受旧租约发布；接收轮询约 3 秒，仅在正常网络/前台调度下构成约 40+3 秒预算。在线关闭/后台立即尝试 close；接收端下一次快照移除。每次请求重新校验权限，撤销后的发布拒绝，快照过滤已撤销成员；已在撤销前生成的 HTTP 响应可能在网络中稍后到达，下一次快照更正（不会延长服务端租约）。客户端丢弃旧生命周期迟到响应。用户权限检查与发布事务持有行锁，因此撤销与发布具有明确提交顺序。

隔离验证脚本会启动独立 guard、Realtime、Auth、Storage、PostgREST、Edge HTTP，只使用新建 fixture/随机密钥。共享实例仍只读 schema。共享实际启用需要另一个有授权的维护任务；本 PR 没有实施或宣称部署完成。
