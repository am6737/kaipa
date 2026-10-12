# 旅程口令 v2

口令为大写 `[0-9A-Z]{4}`，链接格式 `${EXPO_PUBLIC_WEB_URL}/j/<CODE>`。口令默认 7 天有效；active code 全局唯一且每个旅程只能有一个。

`ensure_journey_share(p_journey_id)`（主人或同行伙伴）和 `rotate_journey_share(p_journey_id)`（仅主人）返回 `{code, expires_at}`；`stop_journey_share(p_journey_id)`（仅主人）停用当前口令并返回 `{status:"stopped"}`。

`journey-join` POST `{code}`，认证用户必须携带 `x-device-id`。响应始终 200：`joined`、`already_joined`、`full`、`auth_required`、`busy`，成功时另有 `journeyId`。用户 15 分钟 5 次或 24 小时 20 次失败、IP 1 小时 30 次、设备 15 分钟 10 次会锁定；成功加入每 10 分钟最多 3 次。Edge 限流为用户 20/600 秒、请求对端 60/600 秒。

resources 的 `guest_open` 请求体仅需 `{action:"guest_open", code}`，服务端按 code 和 IP（访客 IP 1 小时失败 10 次锁定）处理。

Edge Runtime 位于 Kong 后时，内网/回环 remoteAddr 会被视为不可信并跳过 IP 桶；设备缺失时不产生设备哈希。要启用按 IP 限流，需先在 Kong 配置可信 real-ip。

本 migration 和 Edge Function 尚未部署；运维需手动执行 `infra/supabase/apply-migration.sh` 与 `infra/supabase/deploy-functions.sh`。

## 主人侧配套

主人收到伙伴通过口令加入时，会在通知中看到“通过口令加入了你的旅程”，并可从通知进入对应旅程。主人移出有账号的伙伴后可选择同时更换口令；确认后客户端调用 `rotateJourneyShare`，并用现有 toast 提示成功或失败。无账号伙伴和非主人不会显示更换口令提示。
