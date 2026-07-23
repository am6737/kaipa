# gear-link-preview Edge Function

服务端商品链接解析器。客户端只提交 URL；开放平台密钥必须保存为 Supabase
Secrets，不能放进 Expo 的 `EXPO_PUBLIC_*` 环境变量。得物商品主图会下载到
项目自己的 Supabase Storage，再将自有公开地址返回给客户端。

## 安全策略

- 只允许 HTTP/HTTPS，不接受带账号密码、私网 IP 或非常规端口的 URL。
- 默认只抓取淘宝、天猫、京东相关域名。
- 得物仅允许 `dw4.co`、`dewu.com` 商品页以及受信任的得物图片 CDN。
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

## 其他商城

逗号分隔域名，仅加入明确需要支持且已确认允许服务端读取的站点：

```bash
supabase secrets set GEAR_LINK_ALLOWED_HOSTS='www.example.com,shop.example.org'
```

## 部署

```bash
supabase functions deploy gear-link-preview
```

部署后使用登录用户的 Supabase JWT 调用。不要使用 `--no-verify-jwt`。
