# 国内短信多供应商路由

短信发送应经过独立的路由层，不把 GoTrue 直接绑定到某一家厂商。当前路由核心位于
`supabase/functions/_shared/sms-router.ts`，按 `SMS_PROVIDER_ORDER` 顺序尝试供应商，只有
供应商明确返回失败时才切换，避免同一个验证码被重复发送。

当前支持的适配器名称：`tencent`、`volcano`、`aliyun`、`huawei`。每个适配器通过一个内部
HTTP 网关接入，网关负责调用厂商 SDK，并在厂商接受请求后返回 2xx。这样厂商密钥只存在
服务端，切换供应商不需要改 App 或 Auth 流程。

示例环境变量：

```env
SMS_PROVIDER_ORDER=tencent,volcano,aliyun
SMS_TENCENT_ENDPOINT=http://sms-gateway:8080/tencent
SMS_TENCENT_SECRET=...
SMS_VOLCANO_ENDPOINT=http://sms-gateway:8080/volcano
SMS_VOLCANO_SECRET=...
```

网关请求体为：

```json
{"request_id":"...","phone":"+8613812345678","code":"123456","template":"..."}
```

网关必须使用 `request_id` 做幂等键，记录供应商响应和延迟，并对手机号脱敏。不得因为用户
尚未收到短信就立即切换供应商，否则会造成重复短信和重复计费。

## 自托管部署

`sms-gateway` 已纳入现有 `infra/supabase/deploy-functions.sh`。部署前在
`infra/supabase/docker/.env` 设置 `SMS_HOOK_ENABLED=true`、`SMS_GATEWAY_SECRET`、
`SMS_HOOK_SECRETS` 以及腾讯云凭证，然后执行：

```bash
infra/supabase/deploy-functions.sh sms-gateway
```

`SMS_GATEWAY_SECRET` 和 Hook 请求携带的 secret 必须一致。生产环境不要启用
`SMS_TEST_OTP` 或 `GOTRUE_SMS_AUTOCONFIRM`。

供应商公开单价会随套餐和量级变化，采购前应以企业控制台报价为准；应同时比较到达率、失败
率、审核周期和最低消费，而不是只比较单条价格。

## 防刷限制

`20261011113000_sms_abuse_limits.sql` 为短信网关提供数据库原子限流：默认同一手机号每分钟
1 次、每小时 5 次、每天 10 次；同时支持 IP、设备和全站每日上限。限流记录只保存 HMAC
后的标识，不保存明文手机号或 IP。限流预留发生在调用供应商之前，即使供应商故障也会消耗
一次额度，避免攻击者利用故障重试刷量。

如果 Auth Hook 没有转发原始 IP，IP/设备维度只能在独立的 App 发送入口中生效；手机号维度
和全局预算仍然有效。
