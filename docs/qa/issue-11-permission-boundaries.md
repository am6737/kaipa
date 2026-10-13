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

建议 Lead 请求 owner 确认的具体决策：批准访客统一校验 migration；位置优先采用认证发布入口，由服务端验证 JWT、每次检查旅程成员资格、拒绝身份不符并生成可信分发身份，接收频道仅允许服务端发布。旧公共 presence 发布入口须同时禁用，旧 App 的位置分享需要升级，不能以回退公共频道维持旧版位置分享。采用此路线前还需明确离开/断连后位置消失语义，验证可继续满足现有体验。若 owner 要求保留原 presence 协议，则改走受控 Realtime 服务端每次 track 鉴权/撤销校验的方案，并接受额外服务维护成本。这里是待批准方案，不是已实现或已验证的接口。

## 合法体验与验收计划

匿名无登录客户端和匿名 Auth 账号不能冒充旅程成员发布；持有效口令的 Web 访客仍能匿名浏览、署名发墙内容，并按会话拥有权删除自己的内容。受邀注册成员可正常访问和发布位置。Web 访客会话不等于成员身份，不能自动获得位置发布权。

在完全独立测试服务上先复现，然后验证匿名、自报他人身份、非成员、成员移出/退出/旅程删除后的发布被明确拒绝，合法主人与成员正常发布；撤销必须覆盖已连接的会话。访客回归覆盖有效口令、旧 token 的过期读取/文字写入/删除/上传申请/已发票据上传，关闭邀请、轮换口令、删除旅程及 session 到期。不得把超时或连接失败算作授权拒绝。

现有脚本与检查保持原断言、阈值；不处理 #10 的重试风险，不修改 CI、发布、签名或密钥配置，不部署，不修改共享运行实例。真机、成员实际位置接收与地图展示在 #10 尚未验证，本 PR 也不以 mock/服务 ACK 代替此验收。

## 证据

2026-10-13 独立复现：Node 24（驱动）/ Node 22（隔离 WebSocket 客户端），Postgres `supabase/postgres:15.8.1.085`、Realtime `supabase/realtime:v2.102.3`、SDK `2.108.1`。脚本只读取共享库的 schema、角色名与 Realtime migration 版本元数据；不复制用户数据、口令、会话、tenant 配置或密钥。所有 fixture 与临时 JWT 密钥均在新建容器/internal network 内，测试结束删除。

共享库 `snapshot`、文字写入/删除函数体与提交逐字一致；`prepare_resource_upload` 存在部署漂移（票据 TTL/并发限额差异）。隔离库明确重装本提交中这四个**未修改的原函数定义**后复现；没有把部署漂移写成受测提交结果。schema 来自运行实例，并非声称所有表/触发器与提交完全一致。相关 schema ACL 保留，既有 SQL 权限断言没有删除或跳过。

重跑命令（需 Docker 及本提交锁定的 `node_modules`，从根目录执行；默认 source DB 是自托管 `kaipa-supabase-db`）：

```bash
KAIPA_ISSUE11_EVIDENCE_DIR=/tmp/kaipa-issue11-evidence node scripts/qa/issue11-isolated.cjs
```

脚本 exit 1 是访问边界回归失败；exit 2 是环境/连接错误或未验证，不能当作权限拒绝。位置子脚本当前针对旧 presence 协议复现；修复路线确认后必须接入实际新的拒绝响应断言，不能把连接失败算通过。

| 检查 | 最终结果 |
| --- | --- |
| 独立 SQL 访客矩阵 | **9 通过/4 失败**，psql exit 3：口令过期后旧 session 读取、文字新增、删除自己的内容、上传申请全部仍被接受。有效匿名访客及合法主人/成员资格正常；会话自身过期、关闭邀请、重启邀请不复活旧 session 的边界通过 |
| 独立 Realtime 矩阵 | **2 通过/5 失败**，exit 1：合法主人/成员可发布；无登录匿名、匿名 Auth 账号、已登录非成员、成员冒报另一用户，以及同一连接在成员移出后发布均收到 `SUBSCRIBED, track=ok` |
| 原 `journey-passphrase-v2.sql` / `journey-invite-toggle.sql` | 隔离数据库运行，均 exit 0，显式 ROLLBACK，保持原断言 |
| `/home/coder/.deno/bin/deno check supabase/functions/resources/index.ts supabase/functions/journey-join/index.ts` | 通过 |
| `/home/coder/.deno/bin/deno test --allow-env supabase/functions/_shared/resource-guard_test.ts supabase/functions/journey-join` | 3 通过/0 失败；journey-join 目录没有测试，不能宣称覆盖了该入口的集成行为 |
| `npx --no-install tsc --noEmit` | **失败 exit 2**，37 条错误，完整输出与 #10 的 `baseline-tsc.txt` 逐字一致，SHA-256 `52a64d372599978360a34b4d2ad9f85e9af5df690bbc0e3fbc1c414437e490d7` |
| `node --test scripts/test-companion-presence.cjs` | **15 通过/3 失败**，exit 1，原有关闭/快速重启/退出登录时序断言失败。使用 `git archive 3a6648a` 提取原文件与 `src/`，在 archive 根目录用同一依赖运行得到相同结果；完整输出仅归一化路径/耗时后逐字一致。未调整阈值或产品实现 |
| `node --check scripts/qa/issue11-isolated.cjs`、`node --check scripts/qa/issue11-presence.cjs`、`git diff --check` | 通过 |

完整权限矩阵输出见 [guest evidence](evidence/issue11-guest-boundaries.txt)、[presence evidence](evidence/issue11-presence-boundaries.txt)；SQL 函数匹配见 [source comparison](evidence/issue11-source-match.txt)。以上是**修复前证据**。迁移、协议及兼容方案未批准、未实施，所以没有修复后证据。已有上传票据到期后真实对象上传、真实 Edge HTTP 端到端过期写入、实际 App 成员接收/展示和真机均未验证；SQL 写入证据不代替它们。单纯成员资格函数通过也不代表完整客户端/RLS 读取体验已通过。

PR 保持 draft；没有绿色 CI 证据时不请求 review。
