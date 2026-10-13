# Issue #11 权限边界修复：待确认方案

状态：**等待 Lead 提交 owner 确认迁移与位置协议兼容方案，尚未实施产品修复。**

参考 [#9](https://github.com/am6737/kaipa/issues/9)、[draft PR #10](https://github.com/am6737/kaipa/pull/10)，受测 QA 提交 `df412c4188bf02e94db641380d75194d00f1217a`。本分支从其产品基线 `3a6648afb5bbbce9ded361aa84099d89bfb5089f` 开始，初始工作区干净；没有合入 #10 的全部改动。

## 实际位置与必要变化

- `src/lib/companionPresenceBus.ts`：`attachChannel` 建立公共 `journey-presence:<journeyId>` channel。
- `src/hooks/useCompanionPresence.ts`：发布者把客户端传入的 `userId` 写入 `track` payload。
- `src/lib/companionPresence.ts`：`foldPresenceRoster` 依据未认证 payload 的 `userId` 合并位置。合法成员也能自报另一成员身份；仅改成 private channel 或隐藏按钮不足以修复。
- `supabase/functions/resources/index.ts`：所有 `guest_*` 操作先调用 `resource_guest_snapshot`。
- `supabase/migrations/20261008140000_resource_uploads.sql`：`resource_guest_snapshot` 只检查 guest session 的 90 天期限、share active 和 journey 未删除，没有 share 的 7 天期限。文字写入与删除复用它；`prepare_resource_upload` 的独立校验也缺分享期限。已发放上传票据的存储写入边界需一起核对。
- `supabase/migrations/20261012230000_journey_passphrase_v2.sql` 和 `20261013010000_journey_invite_toggle.sql`：新开 guest session 已检查 share 到期与邀请开关，不能保护旧 session 的后续操作。

## 需 owner 确认

1. **访客数据库函数更新**：新增独立 migration，统一分享 active、`expires_at > now()`、session 有效、journey 未删除及邀请开关校验；snapshot、文字增删、上传申请及已有票据上传都使用相同边界。不回写旧 migration，不改变 4 位口令或有效期，不要求合法 Web 访客注册账号。数据库函数替换属于用户明确要求先确认的迁移部分，目前暂停。
2. **位置服务端身份与权限边界**：需要服务端用验证后的用户身份检查主人/同行成员资格，对每次发布重新校验以涵盖撤销权限后的长连接，禁止把 payload 身份当作真实身份。不能把仅在加入时缓存的频道权限当作撤销后的发布校验。需确认实现路线：保留 presence 并在受控 Realtime 服务端实施每次发布鉴权，或改为认证发布入口和服务端生成身份的分发协议。后一方案涉及频道/协议与旧客户端兼容；前一方案涉及额外服务端维护面。均尚未实施，不能只切换客户端 private flag 后宣称修复。
3. **旧客户端策略**：旧公共频道发布路径必须在服务端失效；新的可信接收端不能接受旧路径的自报身份。需明确升级前位置分享的处理方式、版本共存范围及回退边界，避免声称旧客户端仍安全兼容。

## 合法体验与验收计划

匿名无登录客户端和匿名 Auth 账号不能冒充旅程成员发布；持有效口令的 Web 访客仍能匿名浏览、署名发墙内容，并按会话拥有权删除自己的内容。受邀注册成员可正常访问和发布位置。Web 访客会话不等于成员身份，不能自动获得位置发布权。

在完全独立测试服务上先复现，然后验证匿名、自报他人身份、非成员、成员移出/退出/旅程删除后的发布被明确拒绝，合法主人与成员正常发布；撤销必须覆盖已连接的会话。访客回归覆盖有效口令、旧 token 的过期读取/文字写入/删除/上传申请/已发票据上传，关闭邀请、轮换口令、删除旅程及 session 到期。不得把超时或连接失败算作授权拒绝。

现有脚本与检查保持原断言、阈值；不处理 #10 的重试风险，不修改 CI、发布、签名或密钥配置，不部署，不修改共享运行实例。真机、成员实际位置接收与地图展示在 #10 尚未验证，本 PR 也不以 mock/服务 ACK 代替此验收。

## 证据

独立复现与检查结果将在本节补充。PR 保持 draft；没有绿色 CI 证据时不请求 review。
