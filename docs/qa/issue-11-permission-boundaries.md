# Issue #11 权限边界修复与隔离验收

Owner 2026-10-14 开爬群 seq38 已批准方案 B：项目未发布，不保留旧协议兼容；批准访客数据库迁移、新版认证位置协议和移除旧公共发布路径；断网暂停发布，重连重新校验权限。继续原分支 `happy/builder/jnjbrcf8-1` 和 [draft PR #14](https://github.com/am6737/kaipa/pull/14)，保留 `b22b13c` 的复现/证据，未整合 #10 全部改动。

交付 follow-up 见 [逐项证据与边界核实](issue-11-followup.md)：补齐精确 tsc 基线/命令、CI 无配置证明、真实双客户端 WebSocket postgres_changes 接收、二进制协议限制、断网租约和改动分组。原 HTTP52/SQL45/客户端25 的角色与未验证项以该补充为准；位置接收是 HTTP，不宣称 WebSocket 位置验收。

**仓库实现及隔离验证已完成，未部署或修改共享实例。共享旧公共位置路径仍需要受控入口切换、上游隔离与既有连接排空，不能把本 PR 的代码完成写成共享漏洞已关闭。** 禁止部署、共享配置修改、合并、CI/发布/签名/密钥配置变更的边界保持有效。PR 保持 draft，没有绿色 CI 时不请求 review。

## 访客权限

`20261014100000_guest_permission_boundaries.sql` 新增内部 `require_resource_guest`，固定空 `search_path`，撤销 PUBLIC/anon/authenticated/service_role 的直接执行权。统一检查 guest session 未过期、对应 share active 且 `expires_at > clock_timestamp()`、journey 未删除、`invite_enabled=true`，并验证上传 scope。读取、文字新增/删除通过 snapshot 共用边界，文字幂等和按 session 的内容所有权逻辑保留。

上传申请以最新 `20261012170000_upload_ticket_tuning.sql` 为基准，保留随文件大小变化的 2–30 分钟票据 TTL、8 个并发槽位、访客日配额和全局/用户预算、其他上传用途。`account_storage_object()` 在实际 INSERT/UPDATE 的票据校验中通过 `guest_session_id` 再检查访客权限，发生在 trusted measured size 之前，覆盖已发签名票据以及特权 Storage 数据库写入。真实 Storage 测试证明 trigger 拒绝后对象未提交，不能仅靠 RLS。票据过期/消费的异常改用明确权限错误，其余记账、删除、旧对象无变化元数据更新逻辑保留。

Web 请求格式、匿名口令访客体验、口令/分享/session 原有效期均未改变。校验持有 session/share/journey 行锁到事务结束，撤销/关闭/删除与已接受写入有明确提交顺序；网络中已生成的响应不可能被追溯收回。

## 可信位置协议

`journey-location` 使用 Auth `getUser(token)` 验证真实 JWT，拒绝无登录、签名伪造、过期 JWT、匿名 Auth 账号和冒报另一 `userId`。RPC 的 actor 只来自真实 Auth 返回值。每次 open/publish/close/snapshot 都检查 Auth 用户、当前旅程主人/同行成员以及旅程未删除，客户端没有位置表的读写权或位置 RPC 执行权。

`20261014110000_trusted_journey_locations.sql` 将位置存入私有设备租约；用户身份、发布时间由数据库生成，坐标在 Edge 和 DB 两处校验。每个设备有独立随机 session ID、递增 sequence、40 秒租约和永久关闭的 tombstone（在下一次 open 时清理旧租约），拒绝乱序与迟到写入复活。删除/移动成员会关闭原租约，重新加入需要新会话；旅程删除或主人变更关闭旅程原租约。主人和成员资格行锁覆盖 publish 事务，撤销后原会话发布拒绝。

可信分发采用认证 HTTP 快照，约 3 秒轮询，快照只包含当前合法成员最近设备的位置。客户端不能往快照发布或指定发布者。多个设备折成一个用户头像，关闭一个设备不会关闭另一个设备。`src/lib/companionPresenceBus.ts` 不再订阅 Realtime；`src/hooks/useCompanionPresence.ts` 不再调用公共 track。`src/lib/companionLocationTransport.ts` 处理租约/请求，丢弃旧生命周期迟到响应；self pin 只在服务端确认后显示。

断网立即暂停 GPS/发布并清除本地 self pin，重连 fresh open 重新授权；不排队重放断网期间位置。关闭分享、后台、退出登录尝试立即 close；断网/杀进程/会话已失效时不能保证 close 到达，服务端租约从最后接受发布起保留 40 秒；在线接收端下一次约 3 秒轮询移除，仅是正常网络/前台调度下的预算。接收请求失败或切后台清空快照。撤销前已生成的 HTTP 响应可能稍后到达，下一次快照更正；不声称网络中的位置可即时收回。

核对 `DataContext.tsx:115`，publisher 仍在 app 级挂载；核对 Discover 的详情关闭/切 tab 停分享、伙伴 `userId` 映射与 NativeMap marker 展示，没有引入 UI 文案或导航变更。HTTP 第二客户端收到了合法成员/主人的身份与坐标，但实际 App 地图/头像像素、真机定位/系统后台行为仍未验证。

## 旧公共入口封堵

`supabase/functions/realtime-location-guard/server.ts` 是仓库内准备的 Realtime 网关，封堵 `realtime:journey-presence:*` 所有 Phoenix 消息和输出，并拒绝旧 topic 的 HTTP broadcast。JSON object/array 两种 Phoenix serializer 均覆盖，同一已建立 socket 上的旧 track 收到 `legacy_location_disabled`，没有把伪造 payload 转发给上游。当前 guard 仅转发 JSON Phoenix 帧；SDK v2 的 JSON broadcast 也使用二进制编码，guard 会拒绝此协议。本 App 现有其他调用均为 postgres_changes，新增真实 WS 双客户端 WAL 接收补证通过；仍未逐业务表做全量回归，详见 follow-up。

[受控启用方案](../../infra/supabase/realtime-location-guard/README.md) 明确要求：阻断所有外部 ingress、所有路径改经 guard、上游只能在内网访问，并在阻断期间排空/重启旧 Realtime 连接。只改频道名、private-only、DNS/路由、客户端过滤或隐藏按钮都不够。隔离测试先证明原连接可冒报身份，再受控重启**隔离 Realtime**并观察原 WebSocket close，随后经 guard 的所有角色旧 join 明确拒绝。没有实际应用共享 Kong/Realtime/compose 配置。

## 最终检查

从根目录运行以下命令（Deno 函数与 guard 不由根 tsc 覆盖，因此单独检查）：

```bash
KAIPA_ISSUE11_REPAIRED=1 KAIPA_ISSUE11_EVIDENCE_DIR=/tmp/kaipa-issue11-validated node scripts/qa/issue11-isolated.cjs
node --test scripts/test-companion-presence.cjs
/home/coder/.deno/bin/deno check supabase/functions/resources/index.ts supabase/functions/journey-join/index.ts supabase/functions/journey-location/index.ts supabase/functions/realtime-location-guard/server.ts
/home/coder/.deno/bin/deno test --allow-env --allow-net supabase/functions/_shared/resource-guard_test.ts supabase/functions/journey-join supabase/functions/realtime-location-guard
npx --no-install tsc --noEmit
node --check scripts/qa/issue11-isolated.cjs
node --check scripts/qa/issue11-presence.cjs
node --check scripts/qa/issue11-http-stack.cjs
node --check scripts/qa/issue11-http.cjs
git diff --check
```

| 检查 | 最终结果 |
| --- | --- |
| 访客 SQL 矩阵 | 45 通过/0 失败：过期分享读取/新增/删除/上传申请/特权实际对象写入，邀请关闭、口令轮换、旅程删除、session/票据过期，scope/内容归属/幂等，有效内容与对象完成，内部函数 ACL，2 分钟 TTL 与 8 槽位调优 |
| 真实 HTTP 矩阵 | 52 通过/0 失败：认证位置发布/另一客户端快照、客户端直接 RPC/分发表写入拒绝、匿名/冒报/非成员/撤销原会话拒绝，多设备/关闭/过期/重新授权；有效访客 HTTP 和真实 Storage 上传；过期 token 真实 HTTP 增删读/上传申请，已签名票据真实对象上传与票据到期拒绝；旧 Realtime 原连接排空与所有角色旧路径拒绝 |
| 既有 passphrase / invite SQL | 原断言/ACL 保留，各 exit 0，ROLLBACK |
| 客户端单元与竞态 | 25 通过/0 失败，0 skipped；原 7 项 roster/freshness 断言保留，旧 socket lifecycle 测试适配新租约；增加断网/合法重连/重连拒绝/后台/迟到 open/publish/snapshot/撤销读取覆盖 |
| Deno check | 上述 4 个入口通过 |
| Deno test | 5 通过/0 失败；journey-join 目录仍没有测试，不把这写成该入口 HTTP 验收 |
| 根 tsc | 仍失败，37 条原有错误；输出与修复前 `b22b13c` 基线逐字一致，SHA-256 `52a64d372599978360a34b4d2ad9f85e9af5df690bbc0e3fbc1c414437e490d7`，无新增类型错误 |
| 脚本语法 / diff | 通过 |

修复后输出见 `evidence/issue11-after-*`；仅去除终端行尾空格与文件末尾空行，tsc 原样保留以比较哈希。修复前访客 9 通过/4 失败，公共位置 2 通过/5 失败，分别见原 `issue11-guest-boundaries.txt` / `issue11-presence-boundaries.txt`；本次在修改产品前再次得到相同矩阵。基于 `git archive b22b13c`、同一依赖再次运行原 presence 测试是 15 通过/3 失败（关闭、快速重启、退出登录时序），保留证据，不把旧基线写成全绿。

## 隔离方法和未验证项

脚本只读共享实例的 schema、角色名、版本 migration 元数据（Realtime/Auth/Storage），不复制业务用户、口令、session、tenant 配置或共享密钥。只在新容器/internal network 中写 fixture；所有 JWT 密钥随机生成、临时文件不入库，测试结束删除容器/网络。schema-only/no-owner 的 clone 中 Auth/Storage 运行角色使用测试特权和 Auth search_path；client ACL/RLS 保留，Storage 特权写入正是本次要验证的边界。schema 来源为运行实例，不声称全库都从迁移空库重建。原四个访客定义先恢复 checkout 基线，再明确应用最新上传调优及两份新 migration，避免把部署漂移当产品结果。

真实 HTTP 使用原 `resources/index.ts` 与新 location handler 运行于 Deno HTTP worker，通过隔离 Auth `v2.189.0`、PostgREST `v14.12`、Storage `v1.60.4`、Realtime `v2.102.3` 和 Postgres `15.8.1.085`；不是 mock、SQL-only 或共享部署。没有运行完整自托管 Kong + Supabase edge-runtime worker 的生产拓扑。超时、连接失败、服务启动失败均记为未验证，未计权限拒绝；调试阶段发生的隔离 fixture/连接错误已修正，最终矩阵才是通过证据。

未验证：真机、实际 App 成员位置接收/地图展示、生产拓扑、共享入口切换/全域名和直连端口封堵、共享旧连接排空、其他 Realtime 业务表全量回归（已补经 guard 的真实 journeys WAL 双客户端接收）、并发多事务压力。位置是按提交顺序鉴权与最多 40 秒租约，不承诺跨网络瞬时消失。应用变更还需后续有授权的受控维护任务；本任务未部署/合并，也未更改 CI/发布/签名/密钥配置。GitHub 当前没有绿色 CI，未请求审查。

— 🤖 Builder (Happy Agent)
