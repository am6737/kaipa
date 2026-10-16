# 推送通知（DooPush）

kaipa 的 App 推送链路：客户端注册（Phase 1）+ 服务端发送（Phase 2）。应用内通知统一写
`notifications` 表（DB 触发器 + realtime + MeScreen 消息中心），推送挂在
notifications INSERT 之后的 outbox 上，因此凡是能进消息中心的事件都会尝试推送。

## 场景一览（notification kind → 触发点）

| kind | 场景 | 写入方 |
| --- | --- | --- |
| `join` | 旅伴加入旅程 | 既有触发器 |
| `trip` | 旅伴完成旅程 | 既有触发器 |
| `route_request` | 路线请求审核结果 | 既有触发器 |
| `member` / `system` | 会员、广播、系统消息 | 既有写入方 |
| `guide_review` | 路书审核结果（通过/驳回+理由摘要）→ 通知作者 | 20261011161000 新触发器 |
| `companion_leave` | 旅伴离开旅程 → 通知房主（跳过房主自己） | 同上 |
| `guest_moment` | Web 访客留言/上传瞬间 → 通知房主 | 同上 |
| `departure` | 出发提醒：前 1 天 20:00、当天 08:00（Asia/Shanghai）；按 (旅程, bucket, planned_date) 幂等，改期后会按新日期重新提醒 | `scan_departure_reminders()` |
| `observation_like` | 旧版近期实况被点「有用」（已停用，旧通知仍跳转到路线评论页） | 20261013040000 `route_observation_helpful()` |
| `comment_like` | 路线评论/回复被点赞 → 通知作者（跳过自赞；同人同路线 24h 内只提醒一次） | 20261016120000 `toggle_route_comment_like()` |
| `comment_reply` | 路线评论收到回复 → 通知楼主；回复里 @ 的人另收一条（跳过自己，不合并） | 20261016120000 `route_comments_notify_reply()` |
| `guide_like` | 路书被点「有用」→ 通知作者（同上，`target` 为路书标题） | 20261013040000 `route_guide_helpful()` |

## 发送链路

```
notifications INSERT
  ├─ 行级触发器 enqueue_push_for_notification() → push_outbox 一行（dedupe_key 幂等）
  │     （guest_moment：同旅程 1 小时内已有通知则不再生成推送行）
  └─ 语句级触发器 kick_push_drain() → pg_net POST /functions/v1/send-push-notifications
                                      header X-Notify-Secret（取自 push_runtime_config）

agent-worker 独立并发循环每 60s 兜底（不排在主循环后，规划任务 700s 超时也不影响）：
  rpc kick_push_drain（读库内 secret 再 kick）+ rpc scan_departure_reminders（幂等出发提醒）

send-push-notifications (Deno Edge Function)
  claim_push_jobs(20, FOR UPDATE SKIP LOCKED)
  → 每 job：查 notifications 行 → 该用户 push_devices
  → 免打扰：设备本地 22:00–08:00（按 tz_offset）→ reschedule 到最早当地 08:00(+0–90s 抖动)；
    纯免打扰回拨 attempts，伴随发送失败则保留 attempts 照常计数
  → 频控：同 user+kind+who+target（同人同旅程同动作）5 分钟内已成功推送过 → 直接 done(merged)；
    不同旅伴的加入各推各的，不按 kind 一刀切
  → DooPush POST {base}/apps/{appId}/push/single（Authorization: Bearer dp_as_* App Secret；device_id 填 token 值）
  → complete_push_job 带 p_attempt（领取代次校验，防 5 分钟卡死回收后的双写/双发）；
    失败指数退避，attempts≥6 → dead
payload 携带 {scene, notification_id, target_id}，客户端点击后标已读并路由。
```

## 关键文件

- 迁移：`supabase/migrations/20261011160000_push_outbox.sql`（outbox、claim/complete RPC、
  kick、`push_runtime_config` 单行 secret 表）、`20261011161000_notify_gaps.sql`、
  `20261011162000_departure_reminders.sql`
- 函数：`supabase/functions/send-push-notifications/index.ts`
- worker：`infra/supabase/agent-worker.mjs`（60s tick）
- 客户端注册：`src/push/PushBootstrap.tsx`、`src/lib/doopushRegister.ts`、
  `src/lib/pushDevices.ts`（`register_push_device` RPC 存 token+tz_offset+lang；
  登出/换账号时 `unregister_push_device` 解绑，防止旧账号推送打到当前设备）
- 点击路由：`src/lib/notificationRouting.ts` + `PushNavigator`（AppRoot 内），
  MeScreen 消息中心复用同一 `openNotificationTargetById`

## 配置与密钥

DB 侧（一次性）：
`push_runtime_config` 里存 `notify_secret`（64 hex，触发器与函数共用、fail-closed）：

```bash
docker exec -i kaipa-supabase-db psql -U postgres -d postgres -c \
  "insert into push_runtime_config(key,value) values('notify_secret', encode(gen_random_bytes(32),'hex')) on conflict(key) do nothing"
```

环境变量（`infra/supabase/docker/.env`，setup-kaipa-supabase.sh 会写进 compose 注入）：

| 变量 | 用途 |
| --- | --- |
| `DOOPUSH_APP_ID` | 服务端发送用 app id（**必须是 kaipa 自己的 DooPush 应用**，模板继承来的值是 yibai 的） |
| `DOOPUSH_API_KEY` | 服务端 `dp_as_*` App Secret（Bearer 鉴权，需 `push:send` scope）；缺省时 drain 直接 no-op，本地开发不炸 |
| `DOOPUSH_BASE_URL` | 可选，默认官方 API 域名 |

客户端（`.env`，`app.config.js` 注入 `extra.doopush`）：
`EXPO_PUBLIC_DOOPUSH_APP_ID / EXPO_PUBLIC_DOOPUSH_API_KEY`（`dp_ak_*` app key）；
dev build 变体走 `*_DEV`。Android 厂商标配置（oppo/vivo/hms/honor）见 `app.config.js`。

## 缺原生模块时（旧安装包 / Expo Go）

SDK 入口在模块顶层就 `requireNativeModule('DooPushReactNativeSDK')`，缺模块会在 JS **求值阶段**抛
`Cannot find native module`，比任何 useEffect 门槛都早，整个 App 以 `[runtime not ready]` 红屏起不来。
因此应用侧一律通过 `src/lib/doopushNative.ts` 的 `getDooPush()` 惰性取 SDK：探测不到就整条推送链路
停用（不注册、不入队），App 照常启动，只留一条 `console.error`。
代价是「JS 比安装包新」这种版本错配不再红屏——验证推送前先看那行日志，别把「App 起来了」当成
「设备注册成功」。回归由 `scripts/test-push-native-lazy.cjs` 守（禁止 src 里出现顶层 import 该 SDK）。

## 待办（需要 owner 操作）

1. 在 DooPush 控制台为 kaipa（包名 `com.hitosea.letsgo` / `.dev`，iOS bundle 同）建应用，
   配 APNs 证书/Key 与各 Android 厂商通道，拿到 app key + server key。
2. 把 kaipa 的凭据填进：运行时 `infra/supabase/docker/.env` 的 `DOOPUSH_APP_ID/API_KEY`
   （然后 `bash infra/supabase/deploy-functions.sh`），以及客户端 `.env` 的
   `EXPO_PUBLIC_DOOPUSH_*`（dev 用 `_DEV` 变体）。
3. 新增原生模块需要重新 dev build（`eas build --profile development`），Expo Go 无法验证推送。
4. 真机端到端：dev build 登录 → `push_devices` 出现 token 行 → 触发一条 join/departure →
   收到推送 → 点击跳转到对应旅程/路书/装备并把消息中心该条标已读。

## 验证记录（2026-10-11，本机自托管栈）

- 三个迁移已 apply；`tsc --noEmit` 改动文件无新增错误。
- 鉴权 fail-closed：无 secret 401；带 secret drain ok。
- notifications INSERT → outbox 自动入队 + kick 自动 drain。
- 免打扰：假设备 tz_offset=-660（当地 00:02）→ job reschedule 到当地 08:00，attempts 保持 0，
  不外呼 DooPush。
- 无设备用户 → done(sent 0)；guide_review/companion_leave/guest_moment/departure 触发器
  均生成通知并入队；guest_moment 同旅程 1h 去重（2 条通知 → 1 条推送）。
- `scan_departure_reminders()` 幂等：首跑 2、重跑 0；测试数据已全部清理。

## 验证记录（2026-10-12，真机端到端）

- 修复 401：DooPush 服务端 API 鉴权是 `Authorization: Bearer <dp_as_* App Secret>`，不是
  `X-API-Key`（函数注释与本文档旧稿都写错过）。改头后 join 推送真机到达。
- 真机（App Store 发行版、后台状态）收到 join 推送与消息中心文案一致；插 notifications 行
  触发的全链路（入队→kick→drain→模板→DooPush→手机）验证通过，测试数据已清理。
- 排障时逐段验证过：token/设备行唯一且匹配、device 记录 push_environment=production 与
  正式包一致、iOS 配置已保存非 Mock。
- 已知坑：DooPush 对 `md5(app+标题+正文+设备id)` 相同的推送**返回 400「推送内容重复」并拒收**
  （线上实测；Web 控制台手动重发同文案同样报 400）——完全同文案的重复事件（同一人退出再加入
  同一旅程）过了我方 5 分钟窗口后仍会被 DooPush 挡掉，消息中心仍保留每条；接受此边界，
  不往用户可见文案里塞时间因子。
