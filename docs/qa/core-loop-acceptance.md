# 开爬核心闭环验收（Issue #9）

**结论：核心闭环未通过。** 正常路径有实际通过证据，但分享过期后的访问、伙伴位置频道权限、访客断网重试存在可复现缺陷；根目录类型检查和部分现有测试也未通过。本报告是后续 builder 修复依据，不是上线放行结论。

## 验收依据与基线

- 需求：[Issue #9](https://github.com/am6737/kaipa/issues/9)，2026-10-13 读取正文和评论，正文已提供范围及验收标准，评论为空。按其要求覆盖登录、发现与搜索、创建保存旅程、编辑行程与装备、邀请同伴、Web 访客分享，以及持久化、权限、断网重试、真机地图和系统恢复。
- 受测产品提交：`3a6648afb5bbbce9ded361aa84099d89bfb5089f`（Fix route detail sheet header overlay）。分支 `happy/qa/byd5dsgs-1`，开始时工作区干净。本 PR 只增加验收文档、证据、测试和测试辅助脚本；不改产品、CI、阈值、迁移或共享服务配置，不删除/跳过已有测试。
- 遵循根目录 `AGENTS.md`、`DESIGN.md`，并核对 `docs/journey-passphrase.md`、`docs/route-guides.md`、`docs/journey-group-notes.md`、`docs/privacy-release-checklist.md` 等。
- 环境：Linux x86_64，Node `v24.18.0`，npm `11.16.0`，Deno `2.7.13` / TypeScript `5.9.2`；应用 TypeScript 来自锁定依赖。Playwright `1.56.1`，本机 Chromium 1194，真实 Expo Web 导出包，无产品模块替换。浏览器只允许 localhost 请求；图片、天气和其它外部来源请求被拦截。
- 工作树无 `.env` 和依赖，暂时借用 `/home/coder/workspaces/kaipa/node_modules`；两处 `yarn.lock` SHA-256 相同：`5765f9af5a7043907d6967add6bf17c8c3e221e6f0e41261d175bdc78a08820d`。公开运行参数由该目录现有 `.env` 在进程内读取，服务密钥仅在测试辅助进程内读取，不写入 Git 或证据。
- 自托管运行环境：`kaipa-supabase-*` 容器，网关 `http://127.0.0.1:8010`。运行时函数挂载来自 `/home/coder/workspaces/kaipa/infra/supabase/docker/volumes/functions`。该主工作区 HEAD 为 `acf604db3e661eb3a49cffcda20593a6367dffa5`，与本次提交不同，因此部署数据库结果必须与提交静态结果区分。受测 `resources/index.ts` 和 `journey-join/index.ts` 与部署文件 SHA-256 分别一致（`f2871df7…`、`9316f566…`）；没有声称其它部署文件、数据库结构与本提交完全一致，没有运行迁移。
- 数据库既有测试均在事务内运行；辅助脚本先插入两个隔离 fixture 账号，使原测试读取的前两个 profile 也是测试账号，原断言保持不变。fixture ID 已占用时拒绝执行。9 组全部显式回滚；失败的过期回归随 psql 退出自动回滚。
- 本地集成每次创建两个确认邮箱的测试账号，模拟已完成入门的回访用户，只操作这些账号的旅程、装备和分享；finally 删除账号。最终确认 `remaining_qa_auth=0`、`remaining_qa_journeys=0`。未使用真实用户数据做写入。

## 逐项结论

“通过”仅指该行所列断言。服务层、hook 写入和浏览器刷新不能替代原生 UI、真机重启或进程恢复验收。

| 核心步骤 | 正常路径与实际证据 | 边界/错误路径与结论 | 未覆盖部分 |
| --- | --- | --- | --- |
| 登录 | **通过（邮箱回访用户）**：隔离账号密码登录，真实 Web 邮箱表单登录，刷新后仍可搜索自己的已保存旅程 | 错误密码由真实 GoTrue 拒绝；未对错误文案逐项验收 | 新用户注册/邮件确认、游客账号升级、短信 OTP、二维码、Apple、原生会话冷启动均未验证；测试账号预置 `onboarded_at`，不代表入门流程通过 |
| 路线发现 | **通过（服务读取和 Web 展示）**：真实自托管目录可读，Web 页面显示路线名称，无页面异常 | 现有坐标转换、无效坐标拒绝、选择竞态等断言通过；地图 framing/pin 测试有测试加载阻断 | 未核验每条目录数据的来源/轨迹安全；iOS MapKit、Android 高德、地图手势/底图 POI、Expo Go 回退未验证 |
| 搜索 | **通过（Web）**：输入 `QA 重启后仍在` 找到账号旅程；输入 `QA-NO-MATCH-987654321` 显示“没有找到相关内容” | 空结果页面可见，[截图](evidence/search-empty.png)；指南搜索的局限见 Q-P3-01 | 路线关键词、大小写/前后空格、地区切换、跨权限旅程搜索与结果跳转尚无完整浏览器矩阵 |
| 创建与保存旅程 | **通过（真实 hook + 数据库）**：执行现有 `useJourneys.createJourney/updateJourney`，保存主人、名称、天数；新 SDK 客户端重新登录后读取相同名称和 3 天 | 参考方案导入 SQL 验证原子回滚、同请求重放去重、路线/天数不匹配和已有内容保护 | 未点击完整原生/网页新建表单；创建请求提交后丢响应、连续点击、轨迹提升失败/重试、手机杀进程持久化未验证 |
| 编辑行程 | **通过（既有 SQL）**：保存地点/文字/照片字段组合、清空、时段/分组移动、改名、删除、排序、备注限制、版本快照 | 所有者/非成员写权限、同伴只读、退出后失去读取权限通过；备注 100 字接受、101 字拒绝；部分客户端失败恢复用例被 mock 阻断 | UI 编辑弹层、媒体上传失败、版本恢复、授权同伴编辑与离线草稿恢复未完整验收 |
| 装备与清单 | **通过（真实 hook）**：创建头灯、改名、数量从 1 改为 2、保存套装，另一账号无法读取装备；Web 账号摘要也显示装备/套装 | 参考方案导入得到个人装备清单，重放不重复；错误方案整体回滚 | 旅程共享/个人清单逐角色 CRUD、勾选与批量操作、装备媒体、装备响应丢失重试、原生编辑 UI 未验证 |
| 同伴邀请 | **通过（部署 Edge + SQL）**：主人生成 4 位口令；非成员加入前读不到旅程；`journey-join` 返回 `joined` 后再次返回 `already_joined`；加入后可读、不可改主人名称 | 满员、匿名拒绝、失败次数锁定、主人/授权同伴生成口令、关闭/重启邀请、旧口令、删除旅程和移出后访问等 SQL 断言通过 | 真机扫码/复制/外部分享、Edge 请求来源限流与可信 real-IP、并发加入竞争未验证；位置频道存在 Q-P1-02 |
| Web 访客分享 | **通过（真实浏览器和服务）**：有效口令展示 QA 主人/旅程，输入名字进入墙、发布文字，刷新后文字保留；同 session/requestKey 服务端重放得到同一条记录 | 同名不同 session 不能删除对方文字；关闭邀请后旧码和原 guest session 均拒绝。**失败**：过期访问 Q-P1-01、客户端重试 Q-P1-03、畸形 URL Q-P2-01、断网误导 Q-P2-02 | 图片/视频上传、上传取消/配额、文件直链撤销、批量下载、其它浏览器/移动 Safari 未验证 |
| 重启/后台/权限总体验收 | 浏览器刷新和新 SDK 客户端重新登录的存储读取有实际证据；SQL 权限有实际证据 | **未通过总体标准**：访客过期访问及位置频道越权；**未验证**：操作系统后台/进程恢复 | 没有 iOS/Android 真机、模拟器或原生凭证；不把浏览器刷新写成手机重启通过 |

## 按严重程度排序的问题

### Q-P1-01：口令过期后，已有访客会话仍能读取旅程（产品缺陷）

- 复现：创建隔离主人旅程并生成有效分享；先 `open_resource_guest_session` 获取访客会话并成功读取；将**该 fixture 的**分享 `expires_at` 设为 `'-infinity'`；新开会话已返回 `busy`，再次用原 token 调用 `resource_guest_snapshot`。
- 期望：过期分享立即拒绝已有会话的读取与写入；实际：原会话仍读到快照。`supabase/tests/qa-guest-share-expiry.sql` 在现有部署函数上失败：`QA defect: existing guest session still reads an expired journey share`，exit 3。
- 影响：7 天有效期无法限制已建立会话的访问；访客会话本身可持续 90 天。`resources` 在访客操作前调用同一快照函数，因此写入边界也需跟随修复复核；本次直接证实的是读取，没有声称实际执行过过期写入。
- 模块：`resource_guest_snapshot`（定义于 `supabase/migrations/20261008140000_resource_uploads.sql`）、`supabase/functions/resources/index.ts`；口令入口的有效期检查在后续 passphrase/invite migration 中。
- 给 builder：在服务端统一验证分享 active、有效期、旅程未删除、邀请开关；同时补齐过期读取、文字写入、上传/删除的回归。此 PR 仅提供失败回归，不改迁移或函数。

### Q-P1-02：未登录非成员可在伙伴位置频道发布伪造身份的位置（产品缺陷）

- 复现：仅用公开 anon key、无用户 session 创建 Supabase 客户端；以隔离旅程 ID 订阅 `journey-presence:<journeyId>`；调用 `track({userId: fixtureOwnerId, longitude:110, latitude:25, fixedAt:Date.now()})`。
- 期望：非成员不能加入或发布，不能冒用其他伙伴；实际：`SUBSCRIBED`，`track=ok`。本地集成的权限断言失败，其余核心步骤继续运行，账号最后清理。
- 影响：知道旅程 ID 的外部客户端可以向成员频道发布冒名位置；代码也使用公共频道读取 presence。没有真机证据证明伪造 pin 已显示，成员真实位置的被动监听未单独实测，不能把它们标为已经验证。
- 模块：`src/lib/companionPresenceBus.ts` 的公共 channel；`src/hooks/useCompanionPresence.ts`；其文件头明确记录 membership 绑定尚未实施。
- 给 builder：使用由服务端成员身份授权的频道并约束发布者身份，补非成员、移出成员、退出登录与身份冒用测试；不只依靠旅程 ID 难猜。不得通过改断言或跳过用例掩盖边界缺失。

### Q-P1-03：访客发布响应丢失后重复提交会新增两条文字（产品缺陷）

- 复现：有效访客进入墙，填写一条文字；代理让 `guest_add` 在服务端成功提交后丢弃响应；用户收到失败，再次打开添加并提交同一文字。确定性回归直接执行真实 `useGuestData`，模拟相同的提交成功/响应丢失，再调用一次发布。
- 期望：同一次用户提交的恢复复用 request key，只保留一条；实际：每次 `addMoment` 都生成 `crypto.randomUUID()`，服务端认为是不同请求。回归 `2 !== 1`，2 项正常/断网打开断言通过、该去重断言失败。
- 证据：`scripts/test-qa-guest-retry.cjs`；现有代码 `src/web/useGuestData.ts`；本地真实服务另外证实**相同** requestKey 的重放能去重，因此不是服务端唯一约束失效。
- 影响：断网或响应不确定时用户以为失败却已有记录，重复输入后造成内容重复；照片可能还有重复上传影响，本次未实测。
- 给 builder：为一个待发布操作保留稳定标识和草稿，提交结果不确定时可查询/恢复；明确重试与新的发布操作。补浏览器代理丢响应回归；本次丢响应失败证据来自无网络 hook 回归，未宣称浏览器也完成了丢响应模拟。

### Q-P2-01：畸形编码分享 URL 导致空白页（产品缺陷）

- 复现：在原样导出的 Web 包打开 `/j/%E0%A4%A`；对照 `/j/INVALID`。
- 期望：两者均显示无效链接提示，无未捕获异常；实际：前者 `URI malformed`、body 为空，[空白截图](evidence/malformed-url.png)；后者正常显示无效提示。
- 模块：`src/web/GuestApp.tsx` 的 `parseGuestPath`，未保护 `decodeURIComponent`。
- 影响：错误/破损外链直接使分享页崩溃；给 builder：捕获解码异常并按无效链接呈现，补畸形、空码、小写、尾斜杠测试。

### Q-P2-02：暂时断网被显示为“链接已过期或无效”，没有重试入口（产品缺陷）

- 复现：浏览器打开格式正确的 `/j/AB12`，受控拦截 `resources` 请求并返回 HTTP 503；不需要真实外部网络或实际过期等待。
- 期望：提示暂时网络/服务异常，提供可恢复入口；实际：页面显示链接过期/无效，现有 `useGuestData` 将任何打开异常都变成 `busy`，`GuestApp` 统一显示 ErrorPage。
- 证据：`scripts/qa/core-loop-web.cjs` 的受控响应与 body 记录；服务真实有效链接的正常路径已独立验证。[正常文字墙](evidence/guest-wall.png)。
- 影响：有效邀请被误判为失效，用户可能要求主人换码；给 builder：区分传输、忙碌、无效/过期原因，并增加重试。故障分支的 draft 恢复也与 Q-P1-03 联合复核。

### Q-V-P1-01：根目录类型检查失败（仓库验证阻断）

- 复现：依照 AGENTS 执行 `npx tsc --noEmit`；实际 exit 2，37 条错误。
- 主要错误：`scripts/collect-route-sources.ts` / `_test.ts` 的 `.ts` 导入、`Deno`、`ImportMeta.main`；其引入的 `supabase/functions/app-agent/search/guide-reader.ts` / `registry.ts` 进入 Expo 编译图，出现 `npm:zod` 等类型错误。根目录 exclude 不阻止通过 import 进入的服务端文件。
- 期望：约定的应用检查可成功区分 Deno 与 Expo；影响：无法提供应用类型绿灯，不等同于已证明某个用户页面运行失败。
- 给 builder：梳理编译边界与跨运行时导入，再在各包完成真实检查；本 PR 不改 tsconfig、CI 或阈值。相关 4 个 Edge 入口的独立 `deno check` 已通过，不能拿它替代本失败。

### Q-V-P2-01：现有客户端套件 21 个基线失败，另新增 1 个真实缺陷回归失败（验证阻断/环境限制）

- 完整所选流程套件共 137 个测试：115 通过、22 失败、0 skipped、0 todo。没有删、跳过或修改原断言。
- 17 个属于测试辅助加载缺口：`test-journey-map-framing.cjs` 6 项、`test-map-marker-rebuild.cjs` 10 项缺 `../../i18n` mock；`test-timeline-reorder.cjs` 1 项缺 `../data/timeline` mock。实际产品操作未执行到这些断言，不能认定对应功能已坏或已好。
- 1 个环境失败：`test-map-poi-selection.cjs` 读取借用依赖中的 `AIRMapManager.m`，缺仓库 patch 应有的 `MKMapFeatureAnnotation`。没有为让检查绿而修改共享 node_modules；需在隔离安装并应用正常 postinstall patch 的依赖中复核，不能直接认定本提交 patch 无效。
- 3 个现有 presence 失败：关闭/重新开启/登出后，测试期望的立即 untrack/再次 track 次数不符。代码存在 8 秒 untrack debounce 和发送间隔。可确认代码和测试约定不一致，不能仅据此断言真机分享停止失效；需 builder 明确关停承诺，并用虚拟时间完整验证关停与快速切换，不以放宽预期替代功能验证。
- 新增的第 22 个是 Q-P1-03，已独立说明产品原因。给 builder：补齐 mocks/环境后原样重跑对应文件全量断言，并处理实际产品失败。

### Q-P3-01：全局攻略搜索按路线入口匹配，不能按攻略正文搜索（待补齐能力）

- 静态证据：`SearchScreen.tsx` 的 `matchingGuides` 从 matchingRoutes 产生，源码注明全局攻略查询未实现；输入仅存在于攻略标题/正文而不在路线属性中的词不会得到预期攻略。
- 这是实现范围缺口，不标成已经完成的浏览器失败复现。最小补验：建立隔离已审核攻略，给正文独有词，搜索此词，再按路线名作对照；由产品确认期望全局搜索范围。
- 给 builder：根据产品约定实现可授权的全局攻略索引/查询，或明确入口的搜索语义。不要凭空引用示例攻略数作为生产结果数。

### Q-P3-02：产品说明落后于当前实现（文档待补齐）

README Deferred 仍把创建、全局搜索、邀请/访客墙列为 toast/stub；`docs/route-guides.md` 中部分“本地示例/不能发布”的说明与当前 `useRouteGuides`、`useRouteConditions` 的数据库查询实现不同。按这些旧说明推断功能缺失会误导后续验收。另 `AppRoot.tsx` 的待导入重试状态只在内存，文档也说明重启不保留；本次未模拟该故障，不把它标成已实测数据丢失。建议分别同步说明并确定草稿恢复需求。

## 命令与实际结果

以下都从仓库根目录执行。完整关键输出摘录在 [core-loop-checks.txt](evidence/core-loop-checks.txt)；原始运行日志留在 `/tmp/kaipa-qa-evidence`。测试辅助脚本使用本机服务和随机隔离账号，不能被误用为无需服务的通用单元测试；新增 hook 单元测试不依赖网络或真实时间。

| 命令 | 实际结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 2，37 条错误，Q-V-P1-01 |
| `node --test scripts/import-route-guides.test.mjs scripts/test-journey-*.cjs scripts/test-journey-*.mjs scripts/test-timeline-*.cjs scripts/test-map-marker-rebuild.cjs scripts/test-map-poi-selection.cjs scripts/test-pin-overlap.cjs scripts/test-pin-visibility.cjs scripts/test-companion-presence.cjs scripts/test-track-point-picker-selection.cjs scripts/test-packing-activity-presentation.mjs scripts/test-qa-guest-retry.cjs` | exit 1，137 项，115 通过/22 失败，Q-V-P2-01 |
| `/home/coder/.deno/bin/deno check supabase/functions/resources/index.ts supabase/functions/journey-join/index.ts supabase/functions/create-guest-account/index.ts supabase/functions/map-search/index.ts` | exit 0，4 个入口检查完成 |
| `/home/coder/.deno/bin/deno test --allow-env --allow-read supabase/functions/_shared/resource-guard_test.ts supabase/functions/_shared/route-guides_test.ts supabase/functions/map-search/` | exit 0，27 通过/0 失败；地图供应商行为使用既有受控夹具 |
| `node scripts/qa/core-loop-db.cjs` | exit 0，9 组既有 SQL 全通过并 ROLLBACK；不执行迁移；不用会临时改结构的 `test-route-guide-import-db.cjs` runner |
| `docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/qa-guest-share-expiry.sql` | exit 3，Q-P1-01，事务自动回滚 |
| `node scripts/qa/core-loop-web.cjs` | exit 1：3 个正常/受控错误页面正常渲染，畸形 URL 空白/异常；Q-P2-01、Q-P2-02 |
| `node scripts/qa/core-loop-local-e2e.cjs` | exit 1：正常登录/存储/装备/搜索/邀请/访客路径通过，未登录 presence 发布权限断言失败；finally 两个账号删除成功 |
| `node --check scripts/qa/core-loop-db.cjs`，`node --check scripts/qa/core-loop-local-e2e.cjs`，`node --check scripts/qa/core-loop-web.cjs` | 均 exit 0 |
| 清理后的 SQL 查询 `auth.users` / `journeys` 的 `qa-core-*`、`qa-expiry-*`、`qa-share-expiry-*` 和临时固定 fixture ID | exit 0，剩余账号和旅程均 0 |

原样 Web 导出的最终命令（用 `--clear` 避免之前占位配置缓存造成假失败）：

```bash
node --env-file=/home/coder/workspaces/kaipa/.env -e 'const {spawnSync}=require("node:child_process"); const result=spawnSync("npx",["expo","export","--platform","web","--clear","--output-dir","/tmp/kaipa-qa-web"],{stdio:"inherit",env:{...process.env,EXPO_PUBLIC_SUPABASE_URL:"http://127.0.0.1:8010"}}); process.exit(result.status ?? 1)'
```

结果 exit 0，`Exported: /tmp/kaipa-qa-web`。未为纯文档额外运行测试，也未运行范围外的 admin、AI 全规划、铁路实网或基础设施全套检查。曾单独执行新增 hook 的全文件测试，结果 2 通过/1 失败，与上述总套件一致。

重放辅助脚本前需可用的应用依赖、本机 Supabase 容器、上述 Web 导出和浏览器；本次额外工具只安装到 `/tmp/kaipa-qa-tools`：`npm install --prefix /tmp/kaipa-qa-tools --no-package-lock --ignore-scripts playwright@1.56.1`。可用 `KAIPA_QA_APP_ENV`、`KAIPA_QA_PLAYWRIGHT_MODULE`、`KAIPA_QA_EVIDENCE_DIR` 指定其它本机位置；Chromium 路径和端口在脚本内对应本次环境。暂借依赖缺 native patch 已如实列为限制。

## 数据来源与未覆盖限制

- 本次 catalog 来自真实自托管 `routes` 表（只读），不是 HTML 预览；未独立验证目录记录原始来源、更新日期、安全性和路况。
- 旅程、装备、同伴、访客文字均为隔离 QA fixture，实际经服务持久化，不是真实出行/用户反馈。参考方案测试是本地规划 scaffold 的原子导入，不证明路线推荐内容经审核。
- 当前攻略/路况组件读取数据库的实现是静态核对；未验收发布审核、真实社区投票、天气实网准确性或媒体公开直链安全。文档中旧示例说明不能作为当前真实数据证据。
- Browser 的 hook 测试用受控 UUID/响应，无外网或实际过期等待；过期 SQL 用 `-infinity` 精确修改 fixture，避免等七天。其它现有测试没有改写或跳过。
- 没有真机/模拟器，本机无 `adb` 或 Android SDK；iOS MapKit、Android 高德、原生 Apple/短信、前后台切换、进程杀死与重启、定位权限、热更新/旧二进制兼容全部未验证。浏览器正常路径通过不代表这些项通过。
- 断网重试覆盖 guest hook 丢响应与参考方案 RPC 同请求重放；普通旅程创建、装备新增、行程新增、媒体上传的响应不确定/连续点击/进程恢复矩阵仍未验证。没有宣称“全链路无重复写入”。

## 最小人工补验清单

只使用隔离测试账号 A（主人）、B（同伴）、C（非成员）和独立浏览器访客，完成后清理 fixture；不对真实用户数据操作。

1. **登录及冷启动**：iOS/Android dev build 邮箱正常/错误/断网；游客升级；短信无效/过期/重发/限流；Apple 首次/重复/取消。创建旅程、行程和装备后强杀进程，重启验证账号、名称、天数、行程排序和清单状态；退出后 C 登录不见 A 数据。
2. **地图发现**：iOS MapKit 与 Android 高德各搜索同一路线，验证路线/伙伴坐标、底图 POI、缩放、筛选、切日与弹层 framing；拒绝/撤回定位权限和断网时明确呈现；另在 Expo Go 验证 fallback。不能用 Web SVG 代替此项。
3. **创建编辑**：从路线/参考方案和空白各创建一次；切换路线/天数不静默导错方案；0/1/跨日边界、未知日期、轨迹导入失败和重复点击；编辑/排序/备注 100/101 字、图片上传失败、版本查看/恢复；检查所有保存结果而不是只看 toast。
4. **主人/同伴权限**：A 分别关闭/开启每个 participant permission；B 尝试行程、个人/共享清单、勾选、邀请；C 尝试同一对象 ID；移出 B 后在仍打开的页面复读/复写。位置频道补成员/非成员订阅、伪造身份与移出后的权限。
5. **分享边界**：有效、小写、错误、畸形、过期、关闭、轮换旧码；同昵称两个 guest session 只能删自己的文字/照片；检查邀请关闭/到期后的所有旧页面、上传和文件直链。真实文件 URL 若公开，撤销旅程分享不能自动等同文件撤销，应明确产品承诺。
6. **响应不确定**：代理依次“写入前断网”“已提交但丢响应”“响应到达前强杀”；对旅程创建、行程/装备新增、方案导入、文字/照片发布重试，分别核对数据库记录、上传文件和配额只产生一次预期结果。保留输入；重启后的未完成操作能继续或能准确告知状态。
7. **后台/进程恢复**：定位分享开启后切后台、锁屏、断网/恢复、切回、关闭、登出、快速关开、强杀重启；用另一真机观察位置变灰/消失/恢复与实际时间，核对关停承诺。长时间挂起恢复后邀请/访客会话重新校验。

## 交付与 CI

- Draft PR：[am6737/kaipa#10](https://github.com/am6737/kaipa/pull/10)，保持 draft，不合并、不请求 review。
- 初始文档基线 `05fae74` 和验收报告、失败回归、可重放辅助文件提交 `5f5457a` 均已推送。CI 状态在推送后复核，仍无 checks 回报。
- GitHub 查询 `statusCheckRollup: []`，仓库未发现 `.github/workflows`：**无 CI checks 回报，不能写为 CI 绿**。本地失败如上保留；即使未来 CI 缺少这些检查，也不能替代验收结论。
