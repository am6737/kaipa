# 服务端迁移到独立服务器

把 coder 工作区里运行的 Kaipa 自托管后端搬到一台独立服务器。涉及的脚本：

| 脚本 | 在哪运行 | 作用 |
| --- | --- | --- |
| `infra/server/export-runtime-config.sh` | 旧服务器 | 打包 Git 之外的启动配置：两份 `.env`、`kaipa-client.env`、Kong 配置、Postgres 引导 SQL、pooler 配置、Edge 主路由 |
| `infra/server/export-runtime-data.sh` | 旧服务器 | 停服后打包 Postgres 数据目录和 Storage 文件，见下文「数据」一节 |
| `infra/server/import-runtime-data.sh` | 新服务器 | 校验数据包并解压到运行时目录 |
| `infra/server/check-env.sh` | 两边都可以 | 校验运行时 `.env` 和客户端 env，只输出变量名，不输出值 |
| `infra/server/deploy.sh` | 新服务器 | 起基础栈，部署全部 sidecar、Edge Functions 和后台 worker，然后做冒烟测试；可重复执行 |
| `infra/supabase/production.compose.yml` | 由 `deploy.sh` 安装 | Kong 和 pooler 只绑定 `127.0.0.1`，由宿主机反向代理负责 TLS |

只 clone 仓库是起不来这套服务的：`infra/supabase/docker/volumes/` 和 `.env` 都在 gitignore 里，而且
`supabase/` 下的 SQL 也重建不出当前的库（`setup-kaipa-supabase.sh` 只写死了一部分迁移，库里也没有
迁移记录表）。所以**配置和数据都从旧服务器原样带过去**，不要在新机器上重新生成。

## 交给 AI 执行时

本节写给在新服务器上执行部署的 AI，开始前先读完全文。

**分工**：旧服务器上的操作（导出配置包、停服、打包数据）由人来做，执行部署的 AI 访问不到旧机器。
开始前先确认仓库根目录下已有下面两样东西，缺任何一样都停下来向人要，不要自己去补：

- 配置包（`kaipa-runtime-config-*.tar.gz`），由 `infra/server/export-runtime-config.sh` 生成
- 数据包（`kaipa-data-*.tgz`），由 `infra/server/export-runtime-data.sh` 生成

**禁止**：

- 生成或修改 `JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`、`POSTGRES_PASSWORD`、`VAULT_ENC_KEY`、
  `PG_META_CRYPTO_KEY`、`SECRET_KEY_BASE`、`POOLER_TENANT_ID`。`check-env.sh` 报这些变量有问题时，说明
  配置包不对，停下来问人。
- 运行 `infra/supabase/setup-kaipa-supabase.sh`、`infra/supabase/docker/setup.sh` 或 `reset.sh`，
  也不要执行 `supabase/` 下的 SQL：前者会重新生成密钥，后者会改动已迁移过来的库。
- 运行 `supabase link`、`supabase db push`、`supabase functions deploy`、`deploy-membership.sh`。
- 在数据还没放进 `volumes/db/data` 时启动 db 容器，或使用 `--allow-empty-db`。
- 把 `.env`、配置包、数据包提交到 Git，或者在输出里打印其中的值。
- 在终端或日志里回显任何 secret；查看 `.env` 时只看变量名（`sed 's/=.*//' .env`）。

**需要人提供或决定的事项**，遇到时停下来问，不要自己编：

- 正式域名：API、Web、Admin 各一个
- 新服务器上可用的 DNS（`AUTH_DNS_SERVER`）
- SMTP 账号
- 是否开启手机号登录
- MediaCrawler 的处理方式：留在旧机器上，还是在新机器上重新部署
- 防火墙和反向代理用哪种方案

**执行顺序**：

1. 解压配置包（见「迁移步骤」第 3 步），执行 `chmod 600`，然后删除压缩包。
2. 运行 `infra/server/import-runtime-data.sh <数据包>`（见下文「数据」一节）。脚本报镜像不一致或字节数不一致时停下来问人，
   不要改 `docker-compose.yml` 里的镜像版本去迁就。如果数据包是 `trial` 模式打的，要在报告里注明。
3. 按「`.env` 检查清单」修改，反复运行 `infra/server/check-env.sh`，直到没有 ERROR。WARN 要逐条报告给人，
   由人决定是否接受。
4. 运行 `infra/server/deploy.sh`。需要 Web/Admin 时先在根目录执行 `yarn install`、在 `admin/` 执行
   `npm ci`，再加 `--with-web`。
5. 配置反向代理，然后重跑 `deploy.sh`，直到所有冒烟测试都通过。
6. 向人报告：每个容器的状态、冒烟测试结果、仍然存在的 WARN，以及还需要人来做的事（切换 App 的
   URL 并发版、配置备份）。

**出错时**：先运行 `sh infra/supabase/docker/run.sh logs <service>` 查看日志；如果是 functions 的问题，用
`docker logs kaipa-supabase-edge-functions` 查看。`deploy.sh` 可以重复执行。不要删除 `volumes/`，不要执行
`docker compose down -v`，也不要为了“修好”而重新初始化数据库。

## 迁移步骤

1. **定域名**：API（例如 `api.example.com`）、Web 访客端、Admin 各一个，DNS 指向新服务器。
2. **新服务器准备**：Docker 和 Compose ≥ 2.24，再装 `python3`、`rsync`、`curl`。用 `--with-web` 时还需要
   Node 和依赖。clone 仓库，放在与旧机器相同的相对位置。
3. **导出配置**（旧服务器）：`infra/server/export-runtime-config.sh`，然后用 scp 把包传到新服务器的仓库根目录，
   执行 `tar -xzf`，解压后删掉压缩包。
4. **迁移数据**：旧服务器运行 `export-runtime-data.sh`，新服务器运行 `import-runtime-data.sh`，见下文「数据」一节。
5. **改 `.env`**：按下面的检查清单修改，直到 `infra/server/check-env.sh` 没有 ERROR。
6. **部署**：`infra/server/deploy.sh`，需要 Web/Admin 时加 `--with-web`。
7. **反向代理**：见下文「反向代理」一节。代理生效后重跑 `deploy.sh`，公网探测也应通过。
8. **切换 App**：根目录 `.env` 已指向新域名，重新打包或发 OTA。旧域名保留一段时间并转发到新地址，
   因为已安装的旧版本仍会访问旧地址。

## `.env` 检查清单

文件：`infra/supabase/docker/.env`。`check-env.sh` 会自动检查标了 ✓ 的项。

### 必须原样保留（与数据库和已发布的 App 绑定）

| 变量 | 原因 |
| --- | --- |
| `JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY` ✓ | 改了会让所有用户登录失效，App 里内置的 anon key 也会失效。脚本会校验两把 key 确实由该 secret 签发 |
| `POSTGRES_PASSWORD` ✓ | 必须与拷过去的数据目录一致 |
| `VAULT_ENC_KEY`、`PG_META_CRYPTO_KEY` ✓ | Vault 里的已加密数据要靠它解密 |
| `SECRET_KEY_BASE`、`POOLER_TENANT_ID` ✓ | Realtime 和 Supavisor 的内部状态 |
| `SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`JWT_KEYS`、`JWT_JWKS` | 新版 key 体系，跟着上面几项一起迁 |

### 必须修改

| 变量 | 改成 | 说明 |
| --- | --- | --- |
| `SUPABASE_PUBLIC_URL` ✓ | `https://api.example.com` | 不能是 localhost、coder 域名或内网 IP |
| `API_EXTERNAL_URL` ✓ | 与上面相同 | 目前是 `http://localhost:8010`。Apple 登录回调和邮件链接都由它生成 |
| `SITE_URL` ✓ | Web 访客端地址 | 目前是 `http://localhost:8081` |
| `ADDITIONAL_REDIRECT_URLS` ✓ | 去掉 localhost 和 coder 地址 | 保留 App 的 deep link scheme |
| `S3_PROTOCOL_ACCESS_KEY_ID`、`S3_PROTOCOL_ACCESS_KEY_SECRET` ✓ | 新的随机值（`openssl rand -hex 16` 和 `openssl rand -hex 32`） | **目前用的是 `.env.example` 里公开的默认值**，而 Kong 对外暴露了 `/storage/v1/s3`，等于任何人都能读写全部 Storage。App、admin、functions 都不用这对 key，可以直接换 |
| `DASHBOARD_USERNAME`、`DASHBOARD_PASSWORD` ✓ | 非默认用户名和强密码 | Studio 通过 Kong 的 basic auth 对外开放 |
| `AUTH_DNS_SERVER` ✓ | 新服务器可用的 DNS（宿主机的 resolver，或 `223.5.5.5`） | compose 里的默认值 `192.168.100.200` 只在 coder 网络里存在。Apple 登录需要靠它拉取 Apple 公钥 |
| `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_ADMIN_EMAIL`、`SMTP_SENDER_NAME` ✓ | 真实的邮件服务 | 目前是不存在的 `supabase-mail`。App 用到了邮箱注册、找回密码和改邮箱 |
| 重复的 `DOOPUSH_APP_ID`、`DOOPUSH_API_KEY` ✓ | 每个只保留一行 | 现在后一行是空值，把前一行覆盖掉了，推送因此不生效 |

`KONG_HTTP_PORT`、`POSTGRES_PORT`、`POOLER_PROXY_PORT_TRANSACTION` 保持原值即可，overlay 会把它们绑定到
`127.0.0.1`。`KONG_HTTPS_PORT` 在生产环境不对外发布。

### 按上线策略确认

| 变量 | 建议 |
| --- | --- |
| `DISABLE_SIGNUP`、`ENABLE_EMAIL_SIGNUP`、`ENABLE_ANONYMOUS_USERS` | 访客模式依赖匿名用户，保持 `true` |
| `ENABLE_EMAIL_AUTOCONFIRM` ✓ | `false`，前提是 SMTP 已配好 |
| `ENABLE_PHONE_SIGNUP` ✓ | 要开手机号登录时，还需要配 `SMS_HOOK_ENABLED`、`SMS_HOOK_URI`（https）、`SMS_HOOK_SECRETS`、`SMS_GATEWAY_SECRET`、`SMS_HASH_SECRET`、`SMS_PROVIDER_ORDER` 和供应商凭证，详见 [sms-provider-routing.md](sms-provider-routing.md)。**注意**：`docker-compose.yml` 目前没有把 `SMS_HASH_SECRET` 传给 functions 容器，开启前要先补上，`check-env.sh` 会报出来 |
| `ENABLE_PHONE_AUTOCONFIRM` ✓ | 必须为 `false` |

### 功能凭据（缺了对应功能就关闭）

| 变量 | 影响的功能 |
| --- | --- |
| `KAIPA_AI_API_KEY`、`KAIPA_AI_BASE_URL`、`KAIPA_AI_MODEL`、`KAIPA_AI_FLASH_MODEL` ✓ | 智能规划和 topic-guard（必填） |
| `AMAP_WEB_KEY` ✓ | 地图搜索和路线规划 |
| `TAVILY_API_KEYS` ✓ | 出行搜索 |
| `MEDIACRAWLER_SEARCH_URL`、`MEDIACRAWLER_API_KEY` ✓ | 小红书和抖音搜索。爬虫是旧机器上的宿主进程，**不随这次部署迁移**，见下文「已知限制」 |
| `FLYAI_API_KEY` ✓ | 航班查询，为空时 `deploy.sh` 会跳过 flyai-query |
| `DOOPUSH_APP_ID`、`DOOPUSH_API_KEY` ✓ | 推送 |
| `TAOBAO_*`、`JD_*` ✓ | 装备链接预览 |
| `ASR_*` | 语音转写，默认用同一 compose 里的 whisper 容器 |
| `FLYAI_QUERY_TOKEN`、`TOPIC_GUARD_TOKEN` | 为空时由 deploy 脚本自动生成 |

### 客户端 env（必须与运行时一致）

| 文件 | 变量 |
| --- | --- |
| `infra/supabase/docker/kaipa-client.env` ✓ | `EXPO_PUBLIC_SUPABASE_URL` 与 `SUPABASE_PUBLIC_URL` 一致，`EXPO_PUBLIC_SUPABASE_ANON_KEY` 与 `ANON_KEY` 一致 |
| 仓库根目录 `.env` ✓ | 同上，另外 `EXPO_PUBLIC_WEB_URL` 改成新的 Web 地址。部署脚本会拒绝两份 URL 不一致的情况 |

## 数据

数据目录约 230 MB，Storage 使用本地文件后端，约 450 MB，整目录拷贝最可靠。打包和解压都用脚本完成，两个脚本都需要 sudo，因为数据目录属于容器内用户，打包时会保留数值 uid。

**旧服务器**：`infra/server/export-runtime-data.sh`。数据库只有在停机状态下文件才一致，所以脚本会先停掉全部
`kaipa-*` 容器，按 worker、网关、pooler、Postgres 的顺序停，然后打包到 `~/kaipa-data-<时间>.tgz`
（权限 600），并在包里附一份清单，记录镜像版本、文件总字节数和 Storage 文件数。运行时必须选一种模式：

| 模式 | 用途 |
| --- | --- |
| `--dry-run` | 只列出会停哪些容器、数据有多大，不做任何改动 |
| `--trial` | 演练：打包完立即把原来的容器重新启动。之后旧服务器上的新写入不在这个包里 |
| `--final` | 正式切换：打包后容器保持停止，旧服务器不要再启动 |

打包过程中任何一步失败，脚本都会把已经停掉的容器重新启动。停机时长取决于 agent-worker：如果有规划任务正在执行，它最多会等 320 秒。

**新服务器**：先解压配置包，再运行 `infra/server/import-runtime-data.sh kaipa-data-<时间>.tgz`，最后运行
`deploy.sh`。脚本会依次检查：

- db 容器是否在运行，在运行就拒绝；
- 包里的 Postgres 镜像是否与 `docker-compose.yml` 一致（当前是 `supabase/postgres:15.8.1.085`），不一致就拒绝；
- 解压后的字节数和文件数是否与清单一致。

目标目录已有数据时，脚本会拒绝执行；加 `--replace` 后，已有数据会被挪到 `volumes/*.replaced-<时间>`，不会被删除。

建议的切换节奏：

1. 用 `--trial` 包把新服务器完整部署一遍，并在新服务器上完成验证。
2. 停写，在旧服务器运行 `--final`。
3. 在新服务器运行 `import-runtime-data.sh <新包> --replace`，然后重跑 `deploy.sh`。
4. 切换 DNS。

`deploy.sh` 在 `volumes/db/data` 为空时会拒绝启动，避免 Postgres 先初始化出一个空库。启动后它还会检查
`public.journeys` 是否存在。

## 反向代理

宿主机上的 Caddy 示例（自动签发证书）：

```caddy
api.example.com {
	reverse_proxy 127.0.0.1:8010 {
		transport http {
			read_timeout 15m
		}
	}
}
app.example.com {
	reverse_proxy 127.0.0.1:7072
}
admin.example.com {
	reverse_proxy 127.0.0.1:4173
}
```

`read_timeout` 不能低于 Kong 的 functions 超时（780 秒，由 `patch-runtime-kong-timeout.sh` 设置），否则长时间的规划请求会在代理这一层被切断。防火墙只放行 22、80、443。

## 已知限制

- **MediaCrawler 网关**：它是宿主机进程，依赖 `~/.local/state` 下的登录态和手动登录过的浏览器，不在
  这套 compose 里。可以继续留在旧机器上，由新服务器通过可达的地址加鉴权调用；也可以按
  `infra/mediacrawler/README.md` 在新机器上重新部署。
- **备份**：目前没有定时备份，上线前要补上每日 `pg_dump` 和 Storage 的异地备份。
- **whisper 镜像**：使用 `latest-cpu` 标签。首次启动会从 HuggingFace 下载模型，新机器要能访问外网。
- **`deploy-membership.sh`**：属于一次性的发布脚本，迁移时不要执行。
