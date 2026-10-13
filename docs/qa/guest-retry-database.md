# Web 访客文字发布丢响应补验（Issue #12）

**结论：本机受测 Web 构建 → 本地自托管 Supabase 的真实路径造成实际数据库重复写入；线上部署未验证。** 访客文字第一次已经提交，但响应被丢弃；浏览器提示失败，用户通过原有 UI 重新输入并发布同一文字。真实 `useGuestData.addMoment` 生成新 `requestKey`，实际 PostgreSQL 保留两条记录。重试后当前页面只显示后一条，刷新后两条均显示。相同 key 的串行、并发重放均正常去重，未发现此次数据库唯一约束失效。

本报告补充 [#9](https://github.com/am6737/kaipa/issues/9) / [draft PR #10](https://github.com/am6737/kaipa/pull/10) 的 Q-P1-03，交付于 [draft PR #13](https://github.com/am6737/kaipa/pull/13)，对应 [#12](https://github.com/am6737/kaipa/issues/12)。只验证 `useGuestData.addMoment → guestResources → resources guest_add → write_resource_guest_moment → shared_moments`；未实施产品修复、部署或迁移，未修改 #11 权限文件、共享运行配置、已有测试或阈值。

## 代码与部署基线

- 浏览器受测提交：`df412c4188bf02e94db641380d75194d00f1217a`。用 `git archive` 原样提取到 `/tmp/kaipa-issue12/tested`，重新导出 Expo Web 至 `/tmp/kaipa-issue12/web`，没有替换 hook、SDK、产品模块或 SQL。
- 本 PR 起点：`3a6648afb5bbbce9ded361aa84099d89bfb5089f`，分支 `happy/qa/vapltmwx-1`，开始时工作区干净。该提交与受测提交的 `src/web` / `resources` 无产品差异，本 PR 只增加本报告、一个 QA 辅助脚本和证据。
- Linux，Node `v24.18.0`，Playwright `1.56.1`，Chromium `141.0.7390.37`（本机 chromium-1194）。借用已有 `/home/coder/workspaces/kaipa/node_modules` 和 `/tmp/kaipa-qa-tools/node_modules/playwright`，未安装新测试库或修改共享依赖。两工作区 `yarn.lock` SHA-256 都为 `5765f9af5a7043907d6967add6bf17c8c3e221e6f0e41261d175bdc78a08820d`。
- 进程内读取已有 `.env`；Web 导出仅在子进程覆盖公开 API URL 为 `http://127.0.0.1:8010`，设置 `EXPO_NO_DOTENV=1`。没有写共享 `.env`。服务密钥只在 Node 内存中读取，浏览器只使用公开 anon key 和自身访客 token；证据不包含 token、密码、密钥、HAR 或完整授权头。
- 实际自托管网关：`http://127.0.0.1:8010`；Edge `supabase/edge-runtime:v1.74.0`，PostgREST `v14.12`，Postgres 镜像 `supabase/postgres:15.8.1.085`，Kong `3.9.1`。完整容器镜像 digest、启动时间在 [实际证据 JSON](evidence/issue-12/guest-retry-database.json) 的 `deployment.containers`。
- 部署函数挂载来自 `/home/coder/workspaces/kaipa/infra/supabase/docker/volumes/functions`；主工作区 HEAD 为 `acf604db3e661eb3a49cffcda20593a6367dffa5`，**不能声称整个部署等于受测提交**。本次逐字节核对受影响部署文件与受测提交一致：`resources/index.ts` SHA-256 `f2871df7079ed848ff7a7482e81e5e090492bbc6e8f7bdd6a12d0b4d9c314b51`；唯一共享源码依赖 `_shared/resource-guard.ts` 为 `5b25ce6a8ab05d773f9808560d49a17526ff24a54500d84a1c6b3e116dc09555`。两文件修改时间均早于本次 Edge 容器启动时间。
- 读取部署 `pg_proc.prosrc`，与受测 `20261008140000_resource_uploads.sql` 的写入函数体去除首尾空白后完全相同，SHA-256 `12fc399b9f5ea087235bec7633c231f4b39c8b107e7ad23634fe89fc34b77f38`；从 `pg_indexes` 核实实际唯一索引。未对整个 schema 或无关函数声明版本一致。
- 新导出的两份 Web bundle 哈希、`src/web` 全部文件及 `App.web.tsx` 哈希均记录于实际证据 JSON；[导出输出](evidence/issue-12/web-export.txt) exit 0。

这里的“实际数据库”“部署处理”均指本机 Docker 自托管服务，不是线上环境或 Supabase Cloud。浏览器访问本次临时静态服务器 `http://127.0.0.1:40149`，API 指向本机 `http://127.0.0.1:8010`，独立 SQL 访问本机 `kaipa-supabase-db` 的 `postgres` 数据库。没有访问线上网页/API/数据库，没有核对线上构建、Edge 文件、SQL 函数、索引或日志；即使版本号相同也不能外推线上行为。上述部署匹配仅覆盖两个受影响 Edge 文件和写入 SQL 函数体，实际索引单独读取，不证明整个部署/schema 等于受测提交。

## 丢响应控制及证据关联

[辅助脚本](../../scripts/qa/guest-retry-database.cjs) 为账号创建独立旅程和分享，通过真实网页填写名字、点击“添加”“发布”。Playwright 路由只对 `guest_add` 作可控代理：`route.fetch({maxRetries:0})` 将原始请求发到真实自托管网关，不构造成功响应、不替换服务端数据。收到实际 HTTP 200 和数据库返回的 moment ID 后，用独立 `docker exec … psql` 查询已提交的 `shared_moments`，确认相同 ID、request key、session 和文字存在，才对浏览器执行 `route.abort('failed')`。正常请求直接转发原始响应。外部图片等来源被拦截，服务写入路径没有拦截为 mock。

最终完整运行时间：2026-10-13 **11:15:06.803–11:15:19.402 UTC**。所有 guest_add 都保存了 request key、Kong 实际 `x-kong-request-id`、Edge 返回 ID、HTTP 状态、处理前后时间，以及交付浏览器响应之前的独立 SQL 查询结果。关联依据是网关响应和实际 DB ID/key/session；未增加服务日志配置或数据库审计，不声称有带相同 request key 的内部逐请求日志/span。

关键两次请求均属于访客 session `90e4d11f-a684-4b22-af8a-d7ff5a5cda10`，旅程 `qa-issue12-29012e50-441a-4e6b-90da-09e38d554914`，文字完全相同：`QA12 丢响应后重试`。

| 项目 | 已提交但丢响应 | 浏览器 UI 再次发布 |
| --- | --- | --- |
| 网络 requestKey | `bb85f5e7-7b10-439f-88cd-245f5a5f0779` | `31af8bfb-4868-43fd-9c79-c7e6e57a903e` |
| Kong request ID | `1d54ed24da0f115ea6be586cbcd8245f` | `c0bf3e457e3054548073d53864b19822` |
| 实际 moment ID | `sm_416bd5ba-521f-4338-ac64-daaa4cb5fd3d` | `sm_6902852f-e928-4d00-867e-c8ba778cfc53` |
| 服务响应时间 UTC | `11:15:11.745`，HTTP 200 | `11:15:12.827`，HTTP 200 |
| 独立 SQL 确认时间 UTC | `11:15:11.942`，1 条 | `11:15:13.065`，2 条 |
| 浏览器结果 | `net::ERR_FAILED`，提示“✓ 操作失败，请稍后重试”，墙上 0 条 | 成功，墙上 1 条；刷新后 2 条 |

JSON 的 `requests[1/2].databaseRowsBeforeBrowserResponse` 与 `cases` 包含完整实际行、`created_at` 及关联字段；`finalDatabaseRows` 记录清理前最终 6 条 fixture 记录。[丢响应截图](evidence/issue-12/lost-response.png)、[刷新后重复截图](evidence/issue-12/duplicate-after-reload.png) 只作 UI 辅证，数据库结论来自 SQL 查询。

## 实际验收矩阵

| 场景 | 操作与实际结果 | 判定与边界 |
| --- | --- | --- |
| 正常请求 | 真实 UI 发布 `QA12 正常发布`；HTTP 200，1 个 key、1 个 ID、数据库 1 条 | 通过；之后刷新仍能显示 |
| 服务提交后响应丢失 | 同一 UI 发布，SQL 确认 1 条后丢弃响应；浏览器网络失败，墙上 0 条 | 故障注入前提通过，确定服务已提交 |
| 丢响应后用户重试 | 同一浏览器、同一 session，重新打开发布表单、重填同一文字；新 key、新 ID，数据库 2 条 | **失败：一次不确定提交的用户恢复造成实际重复**；当前页 1 条，刷新 2 条 |
| 同 key 重复重放 | 从同一浏览器用实际 token/header，串行 `fetch` 重放正常请求两次；两次返回原 ID | 通过；数据库仍 1 条。此行是浏览器 HTTP 重放，不是再次调用 hook |
| 同新 key 并发重放 | 用尚未写入的新 key，浏览器同时发 3 个实际请求（启动于 `11:15:15.305/.308/.309`）；均 200、同一 ID | 通过；真实首次插入竞争只留下 1 条，不只是已有行的重放 |
| 同 session 双页并发 UI | 同一 context 两页都填同一文字并点击发布，请求开始时间 `11:15:17.693/.722`，产生两个不同 key | 实际 DB 2 条。属于两次独立 UI 发布的行为对照，不单独认定为缺陷，也不冒充 hook 自动并发重试 |

丢响应后的“重试”是**用户从现有 UI 重新提交**。产品没有自动重试或专门重试按钮；`GuestWall.handleAddText` 请求前关闭发布层，因此恢复需要重开和重填，不声称原表单草稿保留，也未用直接调用 hook 的方式代替浏览器复现。

## 实际幂等机制与影响

- `useGuestData.addMoment` 每次调用生成 `crypto.randomUUID()`。`guestResources` 使用真实 Supabase SDK `functions.invoke('resources')`，传递该 `requestKey` 和 `x-guest-session`；本次观察到丢响应请求只有 1 次，没有 SDK 自动重发。
- `resources` 将 body.requestKey 原样传入 SQL 的 `p_request`。SQL 要求 key 非 null、长度 1–100；当前页面实际发送 UUID。服务处理还会执行会话快照、限流和服务预算准入；本次请求没有命中这些拒绝分支。
- 实际索引为 `CREATE UNIQUE INDEX shared_moments_request ON public.shared_moments USING btree (guest_session_id, request_key) WHERE (request_key IS NOT NULL)`；SQL 使用对应 `ON CONFLICT … DO UPDATE SET request_key=excluded.request_key RETURNING *`。去重域是**同 session、同 key**，没有文字内容唯一约束，也没有跨 session 去重承诺。同 key 不同内容冲突时不会改写原文字；本次只验证相同内容重放，未扩展到异内容冲突测试。
- 因为用户恢复时换 key，数据库正确执行两次独立插入。原模拟结果与真实路径在这个关键行为上没有差异；本次新增的是网关、部署处理和实际 PostgreSQL 的直接证据，替代了此前该边界“未验证”的状态。
- 沿用 #9 **P1 核心写入一致性问题**：用户见失败后重复发布，可能重复生成文字并让当前页面漏见第一条，刷新才发现重复。没有证据声明线上真实用户已经受影响；照片、上传配额、断网前失败、iOS/Android、移动 Safari、其它账号/session 的重试未验证。
- 建议 builder 优先修复 `src/web/useGuestData.ts` 中待提交操作标识的生命周期，并协调 `GuestWall.tsx` / `GuestUploadSheet.tsx` 的失败草稿恢复、明确新操作与重试。复用稳定 key，再利用已有 `resources` / `write_resource_guest_moment` 去重；增加结果不确定时的恢复查询。保留现有服务端约束；此 PR **未实施修复**。

## 检查、脚本问题与清理

| 实际运行检查 | 最终结果 |
| --- | --- |
| 受测 archive 内 `node node_modules/expo/bin/cli export --platform web --output-dir /tmp/kaipa-issue12/web`（上述公开进程参数） | exit 0，新包导出通过 |
| PR 根目录 `node --check scripts/qa/guest-retry-database.cjs` | exit 0；最终仅用已有 Prettier 排版，之后语法检查通过 |
| PR 根目录 `node scripts/qa/guest-retry-database.cjs` | exit 1；**executionPassed=true，产品验收失败**，完整矩阵完成，唯一产品失败为丢响应 UI 重试重复写入。[运行摘要](evidence/issue-12/probe.txt) |
| 受测 archive 内 `node --test scripts/test-qa-guest-retry.cjs` | exit 1，2 通过 / 1 失败，0 skipped/todo；未修改原测试。[模拟回归输出](evidence/issue-12/hook-regression.txt)，不能拿其中 serverRows 当实际 DB 证据 |
| 受测 archive 与 PR 根目录分别 `npx --no-install tsc --noEmit` | 两者 exit 2，37 条既有错误，输出逐字节相同。SHA-256 均 `52a64d372599978360a34b4d2ad9f85e9af5df690bbc0e3fbc1c414437e490d7`；[完整基线输出](evidence/issue-12/tested-tsc.txt)。与 #10 相同的 Deno 导入/类型边界问题，不能称类型检查通过 |

### 两个 exit 1 的逐项核对

对 PR 原 head `4153f62ef8c18a18abb88809cbf38b1fe3d862bb` 的脚本、原受测测试源码、完整运行证据和退出逻辑进行了只读复核，结果见 [复核及清理追溯 JSON](evidence/issue-12/review-verification.json)。**最终保存的两个 exit 1 完全对应目标缺陷的预期复现，没有脚本自身或环境失败混入这两个最终结果。** 这不抹去下文两次历史定位错误，也不把产品验收改判通过。

| 命令与失败判定 | 期望 / 实际数量 | 对应证据与排除执行故障的依据 |
| --- | --- | --- |
| PR 根目录 `node scripts/qa/guest-retry-database.cjs`：`retry-ui` 的 `retried.length === 1` 为 false，加入唯一 `productFailures`；最终 `productAcceptancePassed=false` 使 exit 1。此处是产品判定，不是抛出的 `assert` 异常 | 同一文字实际 SQL 行期望 1、实际 2；当前页 1、刷新 2。清理前全部 fixture 合计 6：正常 1、丢响应恢复 2、同新 key 并发 1、双页独立发布 2 | 实际 JSON 的 `cases[name=retry-ui]`、`requests[1/2].databaseRowsBeforeBrowserResponse`、`finalDatabaseRows`；两条 ID/key 见上表。完整 7 场景中仅此项 false；10 次实际 guest_add 均 HTTP 200、返回 ID/key 与 SQL 对应；`executionPassed=true`、`pageErrors=[]`，无 `failure` / `shutdownFailure` / `cleanupFailure` 字段，清理 8 项均 0。`net::ERR_FAILED` 是首写 SQL 确认后主动 abort 的预期故障注入，不是环境断连 |
| **受测 archive 目录** `node --test scripts/test-qa-guest-retry.cjs`：第 150 行测试 `QA retrying a guest text after a lost response must leave only one server row`，第 165 行 `assert.equal(world.writes.size, 1)` 失败；信息为 `The same user submission must reuse its request key after a lost response` | 模拟 `writes` Map 期望 1、实际 2；key 为 `request-1` / `request-2`，模拟可见行 1。第 157 行首写已提交的 1 条前提断言通过 | [hook-regression.txt](evidence/issue-12/hook-regression.txt) 明确 `ERR_ASSERTION`、`actual: 2`、`expected: 1` 和 `:165:10`；2 pass / 1 fail / 0 cancelled/skipped/todo。模拟先写 Map 再抛预期丢响应错误，测试以 `assert.rejects` 消化它，第二次 addMoment 才产生新 key。没有网络/数据库访问；源码 SHA-256 `4202d303d55f4bd76df774defc046c5ac5b67ef09d2e8490a5f1d9fca6aa8684` 与受测 git blob、archive 逐字节一致，没有依赖加载、VM 或意外异常失败 |

原 hook 测试来自 #10 的受测提交，**本 PR 根目录并没有 `scripts/test-qa-guest-retry.cjs`**。必须在 `/tmp/kaipa-issue12/tested`（或该 SHA 的等价 archive）运行；在 PR 根目录运行会得到找不到模块的环境/路径失败，不能算目标复现。本报告保存的是正确受测目录的结果。模拟只证明 hook 的标识生命周期，实际 PostgreSQL 两条记录由独立 SQL 证据证明。

本轮只复核证据、补充说明和清理追溯，未发现最终辅助脚本需要修复，因此未重跑数据库写入、hook 测试、Web 导出或类型检查。新运行的脚本语法检查 exit 0；两份原类型检查输出再次比较仍逐字节一致、各 37 条，哈希与上表一致，保留原失败且不修无关错误。PR 没有 GitHub status checks，以上是本机手动检查，不能宣称 CI 通过。

辅助脚本最初有两个 UI 定位错误：提示前的 `✓` 导致精确文字不匹配；回访用户仍有名字输入框，但 CTA 已是“进入旅程”。已分别修正定位后完整重跑，没有删除、跳过测试或改变产品期望；这些属于本次辅助脚本问题，不归因于产品。两个中止运行都先清理账号及业务数据，随后按已知 session UUID 清理各自限流窗口并独立核实全为 0：[初次运行清理记录](evidence/issue-12/initial-attempts-cleanup.json)。

最终运行创建 1 个隔离确认邮箱账号（fixture user ID `fde3aef9-b9ef-4307-86f4-17c10722e731`），旅程、分享、访客会话及全部文字只属于该账号；并发页复用该会话。退出前停止浏览器请求，只删除自己的 session 限流窗口，再删除账号，依靠实际外键级联清理业务数据。独立 SQL 核实 `auth=profiles=journeys=shares=moments=guestSessions=uploadTickets=sessionRateWindows=0`，见实际 JSON 的 `cleanup`。交付前再次按三次运行已知 fixture ID 汇总查询，全部业务记录仍为 0，见 [最终清理复核](evidence/issue-12/final-cleanup-verification.json)。未修改真实用户数据。

本轮复核 JSON 的 `fixtures` 补充三次运行各自的时间、账号/旅程/分享 ID、从原请求 SQL 行提取的 session UUID，以及历史失败/清理结果，避免原汇总摘要缺少 ID 而无法追溯。`readOnlyCleanupVerification` 保存本轮执行的完整定向 SELECT、数据库容器和计数，三账号业务数据及三个 `guest_write` session 限流窗口全部 8 项再次为 0；未新增账号、写入业务或执行 DELETE。原证据文件保持原样，其 SHA-256 也记录于复核 JSON。

**清理边界：** 服务运行日志、全局 `guest_requests` 预算计费记录和分享码短期限流计数是这些真实请求产生的服务记账，不属于账号级联业务数据，未重置或删改。服务端预算 run key 是内部随机 UUID，无法安全按 fixture 归属反查；不能用时间范围删除或恢复共享总数来猜测归属。上面的 0 只适用于明确列出的隔离账号及数据，不宣称全局服务计数未变化。

## 最小复现与复核条件

1. 保持自托管环境不变，按上述 SHA 用 `git archive` 创建临时受测目录；使用同锁文件的既有依赖。重新导出 Web，子进程只覆盖公开 API URL 为本机网关，不改共享 `.env`。
2. 从 PR 根目录运行 `node scripts/qa/guest-retry-database.cjs`。脚本默认使用本次临时目录、已有 Chromium/Playwright 和本机容器；可通过 `KAIPA_QA_TESTED_ROOT`、`KAIPA_QA_WEB_DIR`、`KAIPA_QA_APP_ENV`、`KAIPA_QA_PLAYWRIGHT_MODULE`、`KAIPA_QA_CHROMIUM`、`KAIPA_QA_EVIDENCE_DIR` 指定隔离路径。准备导出的真实受测包，不能指向其他提交的旧包。需要容器只读检查/SQL 访问，以及创建并删除自己 fixture 账号的权限；不会部署或迁移。
3. 脚本自动创建隔离账号/旅程/分享并走真实 UI，确认首写已提交后丢弃响应，见失败提示后重新发布原文字，再刷新。预期一致性标准是数据库 1 条；本次受测结果是 2 条，脚本保留失败退出。
4. 查看证据 JSON 的 `requests` / `cases` / `finalDatabaseRows`；用 key、Kong request ID、返回 ID 和 session 对照。确认 `cleanup` 全部列出字段为 0；若运行中断造成清理失败，只按 JSON 已知 fixture ID 补清理并复查，禁止删改其他账号数据或全局记账。

**交付满足 #12 在环境受限条件下的补验标准**：本机真实浏览器/部署处理/数据库闭环、正常与重试/串行/并发矩阵、版本/幂等约束、重复证据、最小复现、影响建议和定向清理复核均已交付；设备、媒体及线上边界明确保留。完成的是 QA 核实任务，P1 产品缺陷仍未修复，产品验收仍失败，PR 保持 draft。

最小后续步骤：builder 修复稳定待提交 key 与 UI 失败恢复后，在同一隔离本地环境重跑现有写入探测及受测 hook 回归，确认丢响应恢复由 2 条变为 1 条且同 key 串行/并发仍为 1 条。如果需要线上结论，先取得目标线上构建/API/数据库的明确范围和隔离 fixture 权限，核对该环境受影响版本，再补同一丢响应场景及定向清理；不能以本机结果代替这一步。真机和媒体仅在验收范围扩展时另行补验。
