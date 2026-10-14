# Issue #15：访客发布重试

本机修复验收通过：服务端已提交但浏览器丢响应，保留的原表单再次发布使用原 requestKey、返回原 ID；SQL 1 条，当前墙上 1 条，刷新仍 1 条。当前产品范围为 `useGuestData.ts`、`GuestWall.tsx`、`GuestUploadSheet.tsx`、`GuestApp.tsx`、guestResources/guestStorage 及新增 guestDeadline/guestRetryState 客户端辅助模块，另含必要回归/本地辅助脚本/精简证据。历史验证结果按受测提交保留，第二轮当前策略见下表及文末。没有服务端、协议、迁移、部署、共享配置、CI、发布或密钥改动。

依据 [#13](https://github.com/am6737/kaipa/pull/13) head `3ed19ba4ca5982a4c5e32287eed0dd74c419780b` 的报告与真实辅助脚本；取受测 `df412c4188bf02e94db641380d75194d00f1217a` archive 的原 `scripts/test-qa-guest-retry.cjs` 到本 PR 正确路径，没有合入 #13 全部证据。先运行未改产品的原回归得到 2 pass / 1 fail：模拟先提交 Map 再抛响应丢失，重试 key 为 request-1/request-2，期望 1、实际 2。见 [hook-before.txt](evidence/issue-15/hook-before.txt)。模型不是数据库证据。

开始时工作区干净，基于 `3a6648afb5bbbce9ded361aa84099d89bfb5089f`。已核对 #11 仍 OPEN、draft #14 产品权限修复暂停待确认；其改动仅独立复现和文档，与本次客户端文件无交集。没有使用该任务工作树、覆盖或混入其权限改动。修复 draft PR 为 [#16](https://github.com/am6737/kaipa/pull/16)，在产品实现前已创建，始终保持 draft。

## 操作生命周期

| 场景 | 行为 |
| --- | --- |
| 编辑未提交草稿 | 不分配 key；首次点击发布时同步分配 UUID 并锁定本次内容 |
| 同操作串行重试 | 表单保留草稿/key；仍点击原“发布”；SQL 返回原记录，hook 按 ID 合并快照 |
| 同操作并发调用 | hook 在 ref 中同步注册操作并共享 inFlight；表单 ref 额外防止 React 更新前的快速双击 |
| 恢复时改名 | 草稿沿用首次发布时保存的 name/ini/tone；文字及照片均与原 key 配对，明确放弃后新操作使用当前身份 |
| 确定拒绝 / 结果未知 | 都保留 key 和草稿，解除提交中的状态并显示原错误；不从错误文本猜测提交结果。已有服务拒绝明确没有插入时，同 key 重试也安全 |
| 已明确成功 | 墙更新后才关闭表单；下一次“添加”挂载新表单，首次提交生成新 key，即使内容相同 |
| 关闭失败草稿再添加 | 同一 session 恢复 IndexedDB 草稿和原 key；取消/背景关闭不再代表放弃 |
| 明确放弃并新建 | 清理该批次草稿/进度后关闭；下一次添加生成新 key，已提交内容保留；清理中禁止再次发布 |
| 修改失败内容 | 必须明确放弃并新建；同 key 不允许改写请求内容，hook 也校验指纹 |
| 整页刷新 / hook 重新挂载 | 先取真实快照；同 session 读取已确认结果/上传 URI/指纹，添加时恢复已尝试发布的草稿和原 key，只重试未确认项；成功清理后添加才是新操作 |
| 更换分享 / 卸载 | 清空内存操作并隔离旧响应；持久草稿仍按原 session 保存，不迁移至新 session；返回原有效 session 可恢复 |
| 请求一直不返回 | 单项上传+写入链 30 秒后拒绝并释放 pending；迟到响应不能更新结果/快照或继续发下一阶段请求，原草稿/key 保留 |
| 照片批量部分成功 | 每项为同一批次 UUID 加索引；已确认项缓存结果并跳过 HTTP/上传，未确认项沿用原 key 和已上传 URI 恢复（第一轮审查补修） |

UI 显式 key 的结果/URI/指纹按 session 逐项保存在 localStorage，批次全部确认或明确放弃后清理；批次恢复时已确认项直接返回，仅请求未确认项。关闭未知表单后恢复仍使用旧 key；已确认完成或明确放弃后新表单使用新 key。为兼容原 hook 调用，未传显式 key 时，完整输入指纹匹配未确认操作；成功后移除该隐式操作，下次同内容调用生成新 key。这个参数仅改变客户端调用方式，HTTP 仍发送原协议的 `requestKey` / `moment`，未添加服务端字段。

## 本地真实路径与结果

受测产品提交 `2f1483e3f2efcc85e1884dfd83031dcc52983f31`；后续提交仅测试/证据/报告。2026-10-13 11:42:45–11:42:58 UTC，Chromium 141.0.7390.37 / Playwright 1.56.1，与 #13 同一工具和容器路径：临时站点 `http://127.0.0.1:36443` → 本地 Kong `http://127.0.0.1:8010` → resources → Docker `kaipa-supabase-db` 的 `postgres`。

复用主工作区已有 node_modules 和进程内 `.env`，没有使用其他任务工作树文件或更改共享依赖/环境文件。新 Web 导出子进程设 `EXPO_NO_DOTENV=1`、仅覆盖公开 API URL 为上述本地地址。代理只将真实 guest_add 发到本地网关（`maxRetries:0`）；收到 200 并独立 SQL 确认 ID/key/session 已写入后才 abort 浏览器响应。其它正常响应原样转发。证据不保存 token、密码、服务密钥、授权头或 HAR。

[guest-retry-database.json](evidence/issue-15/guest-retry-database.json) 保存 11 次请求的 key、Kong request ID、响应 ID、首写确认时间及 SQL 行，8 个场景的 UI/数据库断言、源码/包哈希、容器版本和清理结果；[probe.txt](evidence/issue-15/probe.txt) 为运行摘要。重复 SQL 行已无损归一化为 `rowCatalog`：请求用 `databaseRowIdsBeforeBrowserResponse`、场景用 `rowIds`、最终结果用 `finalDatabaseRowIds` 引用所见行，顺序和观察时间保留。两个受影响部署函数文件和写入 SQL 函数体与受测提交相同；唯一索引仍为 `(guest_session_id, request_key) WHERE request_key IS NOT NULL`。此核对不证明整个部署/schema 与提交一致。

| 验收 | 实际结果 |
| --- | --- |
| 正常 UI 发布 | 首次 1 条，成功关闭表单 |
| 首写提交后丢响应 | SQL 1 条，墙暂时 0 条，原草稿保留且禁止修改 |
| 原表单再次发布 | key 两次均 `f58fed32-bb42-408b-b431-5c1ec113e71a`，ID 两次均 `sm_65403f32-6f31-46fa-b985-9c99a995b644`；SQL 1 条、墙 1 条、表单关闭 |
| 重试后刷新 | 真实快照恢复，墙 1 条且 SQL 1 条 |
| 明确发起同内容新操作 | 正常文字再次添加，两个不同 key、两条独立记录，未误用旧 key |
| 原 key 两次串行 HTTP 重放 | 都返回原 ID，该 key 仍 1 条（同内容的新操作另有一条） |
| 新 key 三路并发 HTTP 首写 | 都返回同一 ID，SQL 1 条；不是仅重放已存在记录 |
| 同 session 双页独立 UI | 两个不同 key、两条，独立新操作不会相互去重 |

8/8 场景通过，`pageErrors=[]`、`executionPassed=true`、`productAcceptancePassed=true`，没有执行/清理失败。HTTP 串行/并发重放与 hook 并发测试分别覆盖服务路径和客户端行为，不混称为同一种测试。

## 检查和清理

从实际 package scripts / git tree 确认根目录没有 test/lint script 或 `.github` CI workflow；采用现有 node:test/TypeScript 和 Expo Web 导出方式，只检查受影响路径，没有套用 admin 的 lint/build 或扩大到无关套件。

| 命令 | 最终状态 |
| --- | --- |
| `node --test scripts/test-qa-guest-retry.cjs scripts/test-guest-publish.cjs` | 15 pass / 0 fail / 0 skipped / 0 todo，原断言保留；见 [regression.txt](evidence/issue-15/regression.txt) |
| `npx --no-install tsc --noEmit` | exit 2，37 条原有错误，输出与 #13 tested-tsc.txt 逐字一致；见 [tsc.txt](evidence/issue-15/tsc.txt)，无新增，不能称全绿 |
| `diff -u /tmp/issue15-tsc-baseline.txt docs/qa/evidence/issue-15/tsc.txt` | exit 0，基线文件直接从 #13 指定 head 的 git blob 提取 |
| `node /tmp/issue15-export.cjs`（运行 `node node_modules/expo/bin/cli export --platform web --output-dir /tmp/kaipa-issue15/web`） | exit 0；见 [web-export.txt](evidence/issue-15/web-export.txt)，公开进程参数如上 |
| `node --check scripts/qa/issue15-guest-retry-database.cjs` | exit 0 |
| `KAIPA_QA_EVIDENCE_DIR=/tmp/kaipa-issue15/evidence node scripts/qa/issue15-guest-retry-database.cjs` | exit 0，本地真实浏览器/SQL 验收通过 |
| 交付前独立 Docker psql 定向只读清理复查 | 8 项计数全为 0；完整命令/SQL/证据哈希见 [cleanup-verification.json](evidence/issue-15/cleanup-verification.json) |
| `git diff --check` / `git diff --cached --check` | exit 0 |
| `gh pr checks 16 --repo am6737/kaipa` | 无 status checks 回报，不能称 CI 绿；不请求 review |

fixture 账号 `c9ab252f-39d3-4890-ab0c-222d3d7dbd96`，旅程 `qa-issue15-ab9dd862-6d4f-4b5a-a66a-8b17241d48af`，session `57a9bbf3-a9f4-4cfe-a506-8be116567212`。先关闭浏览器请求，仅删除该 session 的 guest_write 限流窗口和 fixture 账号，业务数据按外键级联清理；auth、profiles、journeys、shares、moments、guestSessions、uploadTickets、sessionRateWindows 均为 0。全局预算、分享码短期限流及服务日志保留，不清空或重置共享计数。临时浏览器/静态服务器已经关闭，未更改运行容器配置。

重跑：在本 PR 根目录使用同锁文件依赖，按上面的公开进程参数新导出当前源代码，然后运行辅助脚本。脚本默认读取本 checkout 的 HEAD 并核对 src/web 文件哈希，不能指向另一个版本的旧包；`KAIPA_QA_TESTED_ROOT`、`KAIPA_QA_WEB_DIR`、`KAIPA_QA_APP_ENV`、`KAIPA_QA_PLAYWRIGHT_MODULE`、`KAIPA_QA_CHROMIUM`、`KAIPA_QA_EVIDENCE_DIR` 可指定独立路径。网关固定为本地 8010，不支持线上目标。该辅助脚本适用于客户端修复后保留原表单的行为；原产品复现和真实两条证据仍由 #13 保留，没有改原测试阈值来掩盖失败。

仅验证本机构建和本地 Supabase。真机、实际媒体上传/对象清理、移动 Safari、线上构建/API/数据库和线上部署均未验证，不声称线上已修复；照片 URI 复用与批量失败恢复仅有受控模型/组件回归。当前第二轮修复将已尝试发布的草稿持久化；结果未知时明确放弃并新建仍可能保留前一次已提交记录，这是两次独立操作。#11 权限问题仍独立 OPEN，未在此任务修复。


## 交付范围复核与证据精简

本轮未重跑已通过的产品回归、Web 导出、真实浏览器或数据库检查。重新从 #13 指定 head 提取原基线，用 `cmp /tmp/issue15-tsc-baseline.txt docs/qa/evidence/issue-15/tsc.txt` 验证逐字节相同，仍为 37 条既有错误，无新增错误。

`gh pr checks` 无回报不是失败的测试或待运行 CI。已检查该 head 的 `statusCheckRollup=[]`、check-runs 总数 0、commit statuses 总数 0、Actions runs 空列表及仓库 workflows 总数 0。legacy combined status API 在没有 status 时返回默认 `pending`，不表示已排队/执行中的 CI。因此保留该 CLI 的非零结果，仍不称 CI 绿、不请求 review。

最初 14 文件 +2115/-33 的分布：产品 3 文件 +99/-33；hook/组件回归 2 文件 +445；复用真实路径辅助脚本 1 文件 +630；本次证据 7 文件 +874；报告 1 文件 +67。产品外的主要新增用于可复验性；没有合入 #13 的报告、历史截图、历史多轮清理证据或其它全部材料。没有无关文件、权限产品改动或服务端改动。

发现实际 JSON 的重复 SQL 行后，仅修改证据输出格式：同 ID 行确认完全相同后存一份，11 个逐请求观察集、8 个场景及最终 SQL 集保留有序行 ID 引用。JSON 从 28166 bytes 减至 17654 bytes（减少约 37%），从 683 行减至 466 行；没有删除 key、返回 ID、Kong request ID、时间、实际行字段、UI计数、源码/部署哈希或清理结果。辅助脚本内的真实 SQL、代理、业务断言和阈值全部保持原样。

运行 `node /tmp/issue15-compact-evidence.cjs`，直接执行辅助脚本中的格式化函数，再用独立展开逻辑还原：与原提交 `9dbd628` 的原 JSON 每个字段深度相等，11 请求、8 场景、6 唯一行、全部通过和清理 0 均保留；确认 `src/web` 产品代码无差异。原清理证据的核验时间/SQL/计数/原 SHA 不改，另附原 SHA 的提交范围和精简 SHA/往返校验结果，见 cleanup-verification.json 的 `evidenceCompaction`。额外仅运行辅助脚本语法和 diff 格式检查，不新增数据库写入或重跑产品检查。

生命周期实现和对应覆盖已复核：明确成功后关闭并给新操作新 key（hook、组件、真实浏览器）；提交前确定拒绝/首写后结果未知均保留 key（hook），未知结果保留草稿并从原表单恢复（组件、真实浏览器）；取消失败草稿再打开新表单换 key（组件）；整页重新打开从快照恢复已提交记录、下一次提交用新 key（hook remount、浏览器刷新）；同操作显式/隐式并发共享请求、同内容新操作不复用旧 key（hook、组件及 HTTP 对照）。本任务约定的本地文字重试验收项没有尚未解决项。真机、实际媒体、移动 Safari、线上部署仍是未验证边界；#11 独立权限问题仍 OPEN。


## 第一轮审查唯一阻断：批量恢复耗尽限流窗口

Reviewer 指出的缺陷成立：上一版仅保留 URI/key，已确认项仍会调用 guest_add。每分钟 60 次的准入发生在 SQL 去重前，61 项首次完成 60 条，下一窗口重试的 60 次请求仍被已确认项占用，末项持续无法提交。此轮只修这个客户端阻断，未改服务端限流、协议、数据库、CI 或其它任务文件。

产品只改 useGuestData：保存 guestRequest 成功返回的 GuestMoment 结果，指纹校验后如已有结果即本地返回，不上传、不发 guest_add。GuestWall 仍按原批次索引枚举，保持逐项 key 对齐；已确认项的 hook 调用是无网络的本地跳过。响应丢失/提交前拒绝不会设置 result，未确认项仍持原 key 和 URI 重试。明确新操作的新 key、隐式成功后退役 key、取消重开与 hook 卸载/换分享的缓存清理沿用原生命周期。

先增加真实 hook 的准入模型回归（每窗口 60 次、先计请求再按 key 去重），运行未改产品得到 15 pass / 2 fail；两个新增用例都在下一窗口再次被限流，见 [regression-before.txt](evidence/issue-15/review-1/regression-before.txt)。修复后原断言全部保留并增强成功项零请求断言，最终 17 pass / 0 fail / 0 skipped / 0 todo，见 [regression-after.txt](evidence/issue-15/review-1/regression-after.txt)。

- 61 张照片：首窗口 61 次请求，其中 60 成功、末项限流，服务模型/墙快照均 60 条；新窗口仅 guest_add(batch:60) 一次，最终模型/墙均 61 条；再恢复同批也不增加任何请求或额度消耗，上传共 61 次。
- 未知结果批量：首项确认成功，第二项服务模型提交后丢响应；新窗口跳过首项，只请求第二项至末项共 60 次；未知项两次都用 batch:1、返回原 ID，最终模型/墙均 61 条。随后显式新 key 发布同内容仍生成第 62 条，未误用确认缓存。
- 原组件回归仍覆盖失败表单保留、同 key 重试、成功才关闭、快速双击、取消失败草稿后新操作；原 hook 回归仍覆盖串行/并发、确定失败、换分享/重新挂载。批次索引枚举的组件测试检查 hook 调用，额度测试检查实际 guestRequest 次数，两者不混为 HTTP 重放。

本轮自身检出目录最初无 node_modules。临时 `ln -s /home/coder/workspaces/kaipa/node_modules node_modules`，复用主工作区已安装依赖；没有安装依赖、修改共享 node_modules、package.json 或 lockfile。Node v24.18.0，TypeScript 6.0.3，Expo 56.0.21；两处 yarn.lock SHA-256 均 5765f9af5a7043907d6967add6bf17c8c3e221e6f0e41261d175bdc78a08820d。检查实际从本检出根目录运行，不将 reviewer 未运行 tsc 写成自身结果。交付前移除临时链接，恢复干净工作树。

| 本轮实际命令 | 结果 |
| --- | --- |
| node --test scripts/test-qa-guest-retry.cjs scripts/test-guest-publish.cjs | 修复前 15/2，修复后 17/0，通过，原阈值未降低 |
| npx --no-install tsc --noEmit | 实际运行 exit 2；37 条原有错误，见 [tsc.txt](evidence/issue-15/review-1/tsc.txt) |
| cmp /tmp/issue15-tsc-baseline.txt docs/qa/evidence/issue-15/review-1/tsc.txt | exit 0，与 #13 指定 head 原基线逐字节一致，无新增；SHA-256 52a64d372599978360a34b4d2ad9f85e9af5df690bbc0e3fbc1c414437e490d7 |
| node /tmp/issue15-review1-export.cjs | 新 Web 导出 exit 0；仅进程覆盖本地公开 API URL，见 [web-export.txt](evidence/issue-15/review-1/web-export.txt) |
| node --check scripts/test-qa-guest-retry.cjs && node --check scripts/test-guest-publish.cjs | exit 0 |
| git diff --check && git diff --cached --check | exit 0 |

根目录仍无 test/lint script，沿用已有 node:test、TypeScript 和必要 Web 导出。此轮 61 条和 62 条是执行真实 hook 的受控服务模型结果，不是实际 PostgreSQL 或媒体上传证据；没有重跑浏览器/数据库写入、没有新增共享 fixture，旧真实文字路径证据仍明确属于原受测提交。实际媒体、真机、移动 Safari、线上仍未验证。原 draft PR 更新并回复本阻断，不请求 GitHub review、不合并。


## 第二轮审查唯一阻断：悬挂等待与离开恢复

首轮实现的关闭保护会被永不返回的 SDK 请求困住，而且刷新会丢失未确认操作的 key。此次只修该阻断，新增两个客户端辅助模块并连接原 hook/UI/resources/storage；没有服务端、协议、迁移、部署、CI 或共享运行配置变更。

`guestDeadline` 将 guestRequest（包含错误体解析）、单项上传+guest_add 链和 IndexedDB 操作的等待分别限制为 **30,000 ms**。到时拒绝，finally 释放 pending 和表单提交状态，可关闭或沿原 key 重试。SDK 网络可能继续运行，本方案不承诺取消已到达服务器的写入；超时仅表示结果未知。deadline 与 hook 世代 guard 在源照片读取、票据、签名上传和 guest_add 返回后检查，迟到结果不会发下一阶段请求、修改结果缓存/墙快照或关闭新表单。IndexedDB 超时则 abort 已开始的事务，迟到 open 不再开始事务。

草稿先保存、后发写入；保存失败不发请求。首次发布前只在内存编辑，首次发布将文字/日期/照片内容和批次 UUID 存 IndexedDB。选出的 blob URL 转为 data URL，避免刷新后失效；localStorage 仅存每项进度及照片 SHA-256 指纹，不重复保存媒体。每个 session/批次独立，清理只删自己的 key，已确认结果不重发。关闭、页面离开或刷新均保留已尝试操作；恢复必须是同一有效 guest session。全部成功后先清理再关闭；清理失败仍可恢复确认缓存。明确“放弃此草稿并新建”才清理旧操作，清理中锁住再次发布。

这些上限不是整个批次的 30 秒总上限：保存草稿最多 30 秒，照片指纹计算另最多 30 秒，每项上传+写入最多 30 秒，完成后的清理另最多 30 秒；批量按顺序执行。某个网络阶段悬挂后至多 30 秒结束该项等待并停下批次。存储读取失败可关闭重开，不猜测丢弃未知草稿。浏览器清空存储、隐私模式数据丢失或服务器替换/过期 session 后无法自动恢复原操作，不把 key 迁入新去重域；未尝试发布的编辑草稿不持久化。多页独立草稿不会互相覆盖，恢复选择该 session 首个未清理草稿。

先在未改产品上运行新增回归，原 17 项通过、悬挂/重新挂载两项失败，见 [regression-before.txt](evidence/issue-15/review-2/regression-before.txt)。最终保留全部原 17 项，增加悬挂 guest_add、源读取/票据/上传/错误体、迟到结果、同 key 恢复、确认结果跨 remount、存储失败禁止写入、照片指纹、IndexedDB 超时 abort 等回归；原换分享测试保留计数/快照断言并增强为旧操作必须拒绝。显式放弃测试同时检查清理中捕获的发布回调也无法写入。

本轮真实 Chromium 使用新导出的客户端和原生 IndexedDB，HTTP 由 Playwright 控制，**没有访问真实 Supabase/PostgreSQL，也没有实际媒体上传**。浏览器时钟推进 30,001 ms，验证悬挂结束后保留草稿、同 key 重试恢复 UI、迟到首响应不改新表单、仍 pending 时离开再打开沿原 key 恢复；另验证 blob 内容经 IndexedDB 刷新后可读及独立 key 清理。4 场景通过、pageErrors 空；逐请求 key/模型 ID 与源码/包哈希见 [hung-client.json](evidence/issue-15/review-2/hung-client.json)。模型行数与早期真实 SQL 证据分开报告；未新增共享 fixture，浏览器和临时服务器均关闭。

本检出实际使用临时 node_modules 链接至主工作区已安装的同锁文件依赖；Node 24.18.0、TypeScript 6.0.3、Expo 56.0.21，yarn.lock SHA-256 与第一轮一致，没有安装/修改依赖。根目录没有 lint/test scripts 或 CI workflows，因此使用下列实际检查，交付前移除链接。

| 本轮最终检查 | 结果 |
| --- | --- |
| `node --test scripts/test-qa-guest-retry.cjs scripts/test-guest-publish.cjs scripts/test-guest-deadline.cjs` | 29 pass / 0 fail，原 17 项全部保留；[regression-after.txt](evidence/issue-15/review-2/regression-after.txt) |
| `npx --no-install tsc --noEmit` | exit 2，37 条既有错误；[tsc.txt](evidence/issue-15/review-2/tsc.txt) |
| `cmp /tmp/issue15-tsc-baseline.txt docs/qa/evidence/issue-15/review-2/tsc.txt` | exit 0，与 #13 指定基线逐字节一致，无新增，不称类型检查全绿 |
| `node /tmp/issue15-review2-export.cjs` | Web export exit 0；进程内本地公开 API URL，不改 env；[web-export.txt](evidence/issue-15/review-2/web-export.txt) |
| `node scripts/qa/issue15-hung-client.cjs` | 4/4 场景，通过，受控 HTTP/原生浏览器存储 |
| 受影响回归/浏览器脚本 `node --check`、`git diff --check` | 通过 |

第 2 轮阻断的本地客户端验收无尚未解决项。当前验证边界仍为本机构建、受控悬挂与持久化和历史提交的本地 Supabase 文字证据；本轮未重跑真实 SQL 写入，真机、实际媒体、移动 Safari、线上部署未验证，不声称线上已修复。PR 保持 draft，不请求 review、不合并。


## 授权追加轮次：恢复身份与可见丢弃入口

依据 Owner 明确授权继续在原 draft #16 修复第三轮两项阻断。旧版草稿只保存内容/key，恢复后 GuestWall 用当前身份构造请求，改名导致与原指纹不符而持续拒绝；丢弃按钮又只在 error 分支中，恢复时尚无 error 因而不可见。本轮只处理这两点，不改变之前 30 秒有界等待、关闭/刷新恢复或确认项零请求行为。

首次发布同步复制原访客的 name/ini/tone 至操作 ref，在写入前随草稿保存。恢复后文字/照片发布回调显式传入这份原身份，GuestWall 用它构造所有批次项目；hook 原指纹校验保留，未知项继续原 key、确认项仍直接返回。已保存的旧格式草稿从 key 对应的第一项不可变指纹恢复原身份，不做存储版本迁移；找不到原身份时禁止把当前身份配旧 key，表单允许直接丢弃。恢复表单显示本次草稿所用原访客身份。

丢弃入口移出 error 分支，恢复后无需再尝试发布即可看到并使用。发送或清理中入口可见但禁用，最长等待仍遵循既有每阶段/每项 30 秒上限。清理对应 IndexedDB 草稿与 localStorage 重试进度成功后，经 GuestApp/GuestWall 回调删除 hook 中的对应操作，迟到继续执行必须通过该操作仍存在的 guard；捕获的旧发布回调也被永久退役，不能重新保存已丢弃草稿。刷新不恢复已丢弃内容，下一次明确新操作使用新 key 和当前身份。清理进度失败会显示错误，不静默报告完成；已经到达服务端的写入可能保留，丢弃不是删除服务端内容。

修复前先添加两个真实组件连接回归：旧 29 项通过，两项新增分别因改名恢复不完成、无可见丢弃入口而失败，见 [regression-before.txt](evidence/issue-15/review-3/regression-before.txt)（仅去除输出行末空白）。修复后 **33/33 通过**，原 29 项保留，新增改名+remount 原身份/key、直接丢弃+刷新+新 key/当前身份、丢弃期间迟到响应隔离及旧格式原身份恢复；原捕获回调测试额外检查清理结束后仍不能复活旧草稿。见 [regression-after.txt](evidence/issue-15/review-3/regression-after.txt)。

复用已有真实导出客户端/Chromium/原生 IndexedDB 辅助脚本，仅增加可配置导出及证据路径和本轮断言，无重复复制脚本。**5/5 浏览器场景通过**：保留原悬挂/迟到/原生照片内容恢复场景，在 pending 中离开后改名恢复原身份/key 并成功；新增在无 error 的恢复表单直接丢弃，检查两类持久记录均清除、迟到响应不改新草稿、刷新为空、新提交新 key/最新身份。请求证据保存 name/ini/tone、key、模型 ID，源码/包哈希与 pageErrors，见 [hung-client.json](evidence/issue-15/review-3/hung-client.json)。这些 HTTP/行数来自受控响应和内存模型，**没有访问实际 Supabase/PostgreSQL，也没有实际媒体上传**；照片内容恢复仍使用合成 Blob。浏览器与临时静态服务器关闭，无共享 fixture 或运行实例配置改动。

实际本检出临时链接主工作区同 yarn.lock 已安装依赖（Node 24.18.0、TypeScript 6.0.3、Expo 56.0.21；锁文件 SHA-256 与前轮一致），不安装或更改共享依赖，检查完成后移除链接。

| 本轮实际最终检查 | 结果 |
| --- | --- |
| `node --test scripts/test-qa-guest-retry.cjs scripts/test-guest-publish.cjs scripts/test-guest-deadline.cjs` | 33 pass / 0 fail / 0 skipped / 0 todo |
| `npx --no-install tsc --noEmit` | exit 2，37 条既有错误；[tsc.txt](evidence/issue-15/review-3/tsc.txt) |
| `cmp /tmp/issue15-tsc-baseline.txt docs/qa/evidence/issue-15/review-3/tsc.txt` | exit 0，与指定 #13 基线逐字节一致，无新增，不称类型检查全绿 |
| `node /tmp/issue15-review3-export.cjs` | 新 Web 导出通过，仅进程内本地公开 API URL；[web-export.txt](evidence/issue-15/review-3/web-export.txt) |
| `KAIPA_QA_WEB_DIR=/tmp/kaipa-issue15/review-3/web KAIPA_QA_CLIENT_EVIDENCE=docs/qa/evidence/issue-15/review-3/hung-client.json node scripts/qa/issue15-hung-client.cjs` | 5/5 通过，pageErrors 空 |
| 四个受影响测试/浏览器脚本 `node --check`、diff 检查 | 通过；根目录没有适用 lint script，不改 CI |

当前授权的两项阻断本地验收无遗留，继续交由 Reviewer 审查；PR 保持 draft，不请求 GitHub review、不合并。只验证本机构建与受控浏览器，本轮不将历史真实 SQL 结果冒充当前 head 验证。真机、Safari、实际媒体/对象清理和线上仍未验证；#11 权限问题独立 OPEN，未混入其改动。
