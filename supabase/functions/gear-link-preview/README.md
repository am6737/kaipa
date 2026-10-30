# gear-link-preview Edge Function

服务端商品链接解析器。客户端只提交 URL；开放平台密钥必须保存为 Supabase
Secrets，不能放进 Expo 的 `EXPO_PUBLIC_*` 环境变量。得物、抖音商品主图会下载到
项目自己的 Supabase Storage，再将自有公开地址返回给客户端。

## 安全策略

- 只允许 HTTP/HTTPS，不接受带账号密码、私网 IP 或非常规端口的 URL。
- 默认只抓取淘宝、天猫、京东相关域名。
- 得物仅允许 `dw4.co`、`dewu.com` 商品页以及受信任的得物图片 CDN。
- 抖音只允许请求 `v.douyin.com` 短链本身；`haohuo.jinritemai.com` 只在 302 的
  `Location` 里被读取，不会被抓取，因此不加入可抓取域名列表。
- 其他品牌官网必须显式加入 `GEAR_LINK_ALLOWED_HOSTS`，避免开放式 SSRF 代理。
- HTML 抓取有超时、重定向次数和 1.5 MB 体积限制。
- 优先调用官方开放平台；失败后才读取公开 JSON-LD/Open Graph 元数据。

## 淘宝 / 天猫

```bash
supabase secrets set \
  TAOBAO_APP_KEY=... \
  TAOBAO_APP_SECRET=... \
  TAOBAO_ADZONE_ID=...
```

默认调用 `taobao.tbk.item.info.get`。如果应用获批的是商家商品接口：

```bash
supabase secrets set \
  TAOBAO_API_METHOD=taobao.item.get \
  TAOBAO_SESSION=...
```

不同应用类目获批的 method 和 fields 可能不同，可额外配置：

```bash
supabase secrets set TAOBAO_ITEM_FIELDS='num_iid,title,pic_url,price,weight,brand,props_name,item_url'
```

分享链接只暴露旧商品 ID 时，函数会使用分享标题调用
`taobao.tbk.dg.material.optional.upgrade` 搜索新版物料。该接口必须配置推广位
ID（PID `mm_xxx_xxx_12345678` 的最后一段）：

```bash
supabase secrets set TAOBAO_ADZONE_ID=12345678
```

可选覆盖项：`TAOBAO_MATERIAL_SEARCH_METHOD`、`TAOBAO_MATERIAL_ID`
和 `TAOBAO_BIZ_SCENE_ID`。

## 京东

京东分享短链（`3.cn`）会 302 到明文 SKU 的 `item.m.jd.com` 商品页。函数优先读取
页面服务端渲染的 `window._itemInfo.product`，拿到完整标题、品牌、型号、颜色、主图和
含包装毛重；价格需要登录才可见，留给用户填写。页面解析失败时才回退到下面的联盟接口。

京东风控会把 Edge Runtime 对 `/product/{sku}.html` 和 `item.jd.com` 的请求 302 到
`cfe.m.jd.com` 验证页（curl/Node 不会，本地测试通过不代表线上可用），所以函数优先请求
`item.m.jd.com/ware/view.action?wareId={sku}`，短链解析也在拿到 SKU 的第一跳就停止。
验证时请在 `supabase/edge-runtime` 容器里跑。

京东风控按出口 IP 计数：十几秒内约 80 次商品页请求就会被拦，封禁 1–5 分钟。成功结果
按 SKU 写入共享的 `agent_external_cache`（key `gear-link-preview:v1:jd:{sku}`，默认
30 天，可用 `GEAR_LINK_CACHE_TTL_SECONDS` 调整），同一商品只请求京东一次；分享文案
预填的兜底结果不会缓存。

一旦商品页请求被重定向到 `cfe.m.jd.com` 验证页，函数会暂停京东商品页请求 5 分钟
（`GEAR_LINK_JD_PAUSE_SECONDS`，60–3600），状态写在同一张缓存表的
`gear-link-preview:v1:jd-risk-pause`，所有实例共享。暂停期间缓存命中照常返回，
未命中则用分享文案预填；手动解除可删除这一行。

联盟 APP 的基础权限只能用加密 `itemId` 查 `goods.bigfield.query`（`sceneId=1`），
无法直接查明文 SKU；`promotiongoodsinfo.query` 需要额外申请权限。

```bash
supabase secrets set \
  JD_APP_KEY=... \
  JD_APP_SECRET=...
```

默认调用 `jd.union.open.goods.promotiongoodsinfo.query`。如果应用要求用户授权，
再设置：

```bash
supabase secrets set JD_ACCESS_TOKEN=...
```

获批接口名称不同时可通过 `JD_API_METHOD` 覆盖。

## 得物

得物分享短链会解析到 `fast.dewu.com` 商品页，并从页面服务端渲染数据中读取
SPU、SKU、标题、分类、发售价格、商品参数和当前颜色主图。得物页面通常不提供
可靠的商品净重，客户端仍会要求用户保存前确认。

主图默认写入公开的 `gear-products` Storage bucket。Edge Function 使用 Supabase
内置的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 创建 bucket、下载受信任 CDN
图片并上传。可通过 Secret 修改 bucket 名：

```bash
supabase secrets set GEAR_LINK_IMAGE_BUCKET=gear-products
```

自托管环境如果内部 `SUPABASE_URL` 不能作为移动端公开地址，应同时向 Edge Runtime
提供外部 `SUPABASE_PUBLIC_URL`；官方托管项目无需额外设置。

## 抖音商城

抖音分享文案里的 `https://v.douyin.com/xxxx/` 短链**不需要跟随重定向**：直接请求
它返回 302，`Location` 指向 `haohuo.jinritemai.com/ecommerce/trade/detail/index.html`，
其 query 里已经带上商品数据：

- `id`：商品 ID，用作 `externalId` 和缓存 key。
- `goods_detail`：URL 编码的 JSON，含 `title`、`min_price`、`max_price`（单位是分，
  488 表示 ¥4.88）和 `img.url_list`（主图，jpeg 或 png；`width`/`height` 不可靠，忽略）。

落地页本身是空的 SPA 壳，抓取它拿不到任何数据，所以函数只做**一次**
`redirect: 'manual'` 请求读 `Location`，不抓取 `jinritemai.com`。这条 `Location`
常常有 3–6 KB，超过 `validateUrl` 的 4096 长度上限，所以抖音走 `douyinPreview`
自己的解析分支，不复用 `fetchFollowingSafeRedirects`。

`goods_detail` 是未公开字段，直播间等入口可能没有：

1. 有 `goods_detail`：名称、价格、图片齐全；多规格价格不同（`min_price` 不等于
   `max_price`）时按最低价填写并给出区间警告。
2. 只有 `id`：用分享文案里链接后的标题预填（去掉 `【抖音商城】` 标记），无价格和图片。
3. 都没有：有分享标题就预填，否则报 `product_not_found`。

结果按商品 ID 写入共享的 `agent_external_cache`（key
`gear-link-preview:v1:douyin:{id}`）；只有分享文案预填的兜底结果不缓存。
主图与得物一样存入 `gear-products` bucket（`douyin/{id}/cover.<ext>`）；抖音图片
不需要 Referer，保存失败时退回原 CDN 地址并提示用户图片可能失效。

## 其他商城

逗号分隔域名，仅加入明确需要支持且已确认允许服务端读取的站点：

```bash
supabase secrets set GEAR_LINK_ALLOWED_HOSTS='www.example.com,shop.example.org'
```

## 部署

```bash
infra/supabase/deploy-functions.sh gear-link-preview
```

部署后使用登录用户的 Supabase JWT 调用。不要使用 `--no-verify-jwt`。
