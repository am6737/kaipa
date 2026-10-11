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
  → 频控：同 user+kind 5 分钟内已成功推送过 → 直接 done(merged)
  → DooPush POST {base}/apps/{appId}/push/single（X-API-Key；device_id 填 token 值）
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
| `DOOPUSH_API_KEY` | 服务端 `dp_sk_*` server key；缺省时 drain 直接 no-op，本地开发不炸 |
| `DOOPUSH_BASE_URL` | 可选，默认官方 API 域名 |

客户端（`.env`，`app.config.js` 注入 `extra.doopush`）：
`EXPO_PUBLIC_DOOPUSH_APP_ID / EXPO_PUBLIC_DOOPUSH_API_KEY`（`dp_ak_*` app key）；
dev build 变体走 `*_DEV`。Android 厂商标配置（oppo/vivo/hms/honor）见 `app.config.js`。

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
