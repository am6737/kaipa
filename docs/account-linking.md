# 账号与安全：一个账号绑定多种登录方式

一个开爬账号就是 `auth.users` 里的一行。Apple、邮箱、手机号都是挂在这一行上的 identity
（`auth.identities`），绑上的任一方式都能登录同一个账号，数据都跟着 UID 走。

相关代码：

| 位置 | 作用 |
| --- | --- |
| `src/lib/auth.ts` | `linkApple` / `sendBindEmailCode` / `verifyBindEmail` / `sendBindPhoneCode` / `verifyBindPhone` / `unlinkLoginMethod` |
| `src/hooks/useLoginMethods.ts` | 把 identities 归成 apple / email / phone，错误码到文案的映射 |
| `src/components/me/AccountPage.tsx` | 账号与安全页的「登录方式」卡片；Apple 行直接唤起原生面板绑定或弹窗解绑 |
| `src/components/me/LoginMethodPage.tsx` | 邮箱 / 手机号的绑定、更换、解绑 |

## 规则

1. **至少保留一种登录方式。** UI 先拦；GoTrue 自己也拒绝解绑最后一个 identity
   （`single_identity_not_deletable`）。游客账号的占位邮箱（`…@guest.kaipa.app`）没人知道密码，
   UI 不把它算作已绑定的邮箱，也不提供解绑。
2. **一个来源只属于一个账号。** 已被别的账号占用时报 `identity_already_exists`（Apple）、
   `email_exists`、`phone_exists`，不做账号合并。
3. **绑定前先验证。** Apple 走原生面板拿 ID token 后 `linkIdentity`；邮箱用 `updateUser({ email })`
   发码、`verifyOtp({ type: 'email_change' })` 校验，校验通过后再设登录密码（邮箱登录是邮箱 + 密码）；
   手机号用 `updateUser({ phone })` 发码、`verifyOtp({ type: 'phone_change' })` 校验。
4. **解绑后那把钥匙就登不进这个账号了。** 再用它登录会被当作新用户注册。解绑 email / phone
   会同时清掉 `auth.users` 上对应的 email / phone；解绑 Apple 后账号邮箱换成剩下的 email identity。

Apple 账号在 `auth.users.email` 上留的是 Apple 中转地址（`…@privaterelay.appleid.com`），但没有
email identity，所以它不是邮箱登录方式。页面按 identity 显示，不读 `auth.users.email`。

## 服务端配置（`infra/supabase/docker/docker-compose.yml`）

- `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: "true"`：没有它，`linkIdentity` 会报 `manual_linking_disabled`。
- `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: "false"`：换邮箱只向新邮箱发一个验证码。Apple 账号的旧邮箱是
  中转地址，不能要求用户再去旧邮箱确认。

改完要重建 auth 容器：

```bash
docker compose -f infra/supabase/docker/docker-compose.yml --project-directory infra/supabase/docker up -d --no-deps auth
```

## 发码通道

- 邮箱：GoTrue 默认的换邮箱模板已经带 `{{ .Token }}`。需要可用的 SMTP；`SMTP_HOST=supabase-mail` 没有对应容器时，
  `updateUser({ email })` 会报 `Error sending email change email`。
- 手机号：需要 `ENABLE_PHONE_SIGNUP=true` 并接好短信 Hook（见 `docs/sms-provider-routing.md`）。`phone_login`
  功能开关关着时，页面不提供绑定手机号，已绑定的手机号仍可解绑。

## 未做

- 微信：GoTrue 没有微信 provider，要接需要微信开放平台移动应用凭证、原生 SDK 和一个换 openid/unionid 再签发会话的服务端函数。
- 账号合并。
