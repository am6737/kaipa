# #11 交付边界核实（PR #14，保持 draft）

本次仅补证与缩小无关格式 diff；原修复 `9ce4cbc787da00535ef282eeb1accefb5bdd08a4` 的共享环境部署尚未发生。未部署/修改共享实例，未改 CI，未修其他类型基线，未请求 review。隔离测试只读共享 schema/版本元数据，fixture、密钥、迁移和 Realtime 重启均限定新建容器。

## 1. 类型基线与 CI

修复前基线为 `b22b13c2767d107b083be626189c01c193796868`（只含本 issue 的方案/复现，产品代码与 `3a6648afb5bbbce9ded361aa84099d89bfb5089f` 相同）。同一现有 `node_modules`、同一 TypeScript 版本运行两份源码，均 exit 2、37 条 `error TS`，原始输出逐字一致，SHA-256 均为 `52a64d372599978360a34b4d2ad9f85e9af5df690bbc0e3fbc1c414437e490d7`。输出已入库：[基线](evidence/issue11-followup-tsc-baseline.txt)、[当前](evidence/issue11-followup-tsc-head.txt)；没有新类型失败。可从根目录复现（归档只在临时目录解压，不切换当前分支）：

```bash
task_tsc_base=$(mktemp -d /tmp/kaipa-issue11-tsc-XXXXXX)
git archive b22b13c2767d107b083be626189c01c193796868 | tar -x -C "$task_tsc_base"
ln -s "$(realpath node_modules)" "$task_tsc_base/node_modules"
(cd "$task_tsc_base" && npx --no-install tsc --noEmit --pretty false) > /tmp/issue11-baseline-tsc.txt 2>&1
npx --no-install tsc --noEmit --pretty false > /tmp/issue11-head-tsc.txt 2>&1
cmp /tmp/issue11-baseline-tsc.txt /tmp/issue11-head-tsc.txt
rg -c 'error TS' /tmp/issue11-baseline-tsc.txt /tmp/issue11-head-tsc.txt
sha256sum /tmp/issue11-baseline-tsc.txt /tmp/issue11-head-tsc.txt
```

GitHub API [查询记录](evidence/issue11-followup-ci.json)：仓库 Actions workflows=0、全仓 runs=0、原 head check-runs=0、commit statuses=0。准确分类为**没有配置 GitHub Actions CI，也没有外部 check/status 证据**，不是仍在跑或 CI 失败。零 statuses 的聚合 `state=pending` 不代表有排队中的任务。PR head 的最终只读查询会再次核对。不存在可在“既有 CI 配置”中跑绿的任务；本地受影响的客户端/SQL/HTTP/Deno 检查已有通过证据，根 tsc 在现有基线下不能通过。本任务不创建 CI，也不以基线对照通过冒充 tsc 通过。

## 2. 验收与证据逐项映射

下表的名称对应原 [HTTP52](evidence/issue11-after-http-boundaries.txt)、[SQL45](evidence/issue11-after-guest-boundaries.txt)、[客户端25](evidence/issue11-after-client.txt) 和脚本中的断言。没有重复跑这三套已通过的全套测试。

| 验收 | 已执行断言与边界 |
| --- | --- |
| 过期旧访客读取/增/删/申请 | HTTP `expired old token HTTP read / real Edge HTTP write / HTTP deletion / upload request rejected`；SQL `expired share rejects established-session read / text write / content deletion / upload preparation`；旧 session 自身仍为 90 天有效 |
| 已发票据真实对象上传 | HTTP `previously signed ticket actual object upload rejected by guest trigger`，检查 `guest_session_invalid` 且 `rejected real object never committed`；有效票据真实 Storage 上传成功；SQL 的特权 INSERT 仅是额外触发器边界，不冒充 HTTP Storage |
| 邀请关闭 | SQL `disabled rejects read/write/delete/prepare/actual object insert`；真实 `set_journey_invite_enabled` 后现有 read/write 拒绝，重新开启不复活旧 session；原 invite-toggle SQL exit 0 |
| 口令轮换 | SQL `rotated passphrase rejects established read / actual object insert`；原 passphrase-v2 SQL exit 0。轮换后的旧会话增删/申请未单独逐项跑 HTTP，不将共同 validator 的代码推断写成这些 HTTP 验收已通过 |
| 旅程删除 | SQL `deleted rejects read/write/delete/prepare/actual object insert`；HTTP `deleted journey owner publish rejected` |
| 主人/成员正常位置及另一真实客户端接收 | HTTP `legal member publishes`、owner token 的 `second authenticated client receives member`，断言身份和坐标；`legal owner publishes own location`、member token 的 `member receives legitimate owner location`。是真实 Auth/Edge/DB HTTP，请求使用独立身份，不是 mock |
| 未登录/匿名 Auth/非成员/冒名 | HTTP `no login / anonymous Auth / nonmember rejected`；`forged JWT / expired JWT / member cannot report owner identity`；客户端直调 RPC/写表拒绝；不是超时算拒绝 |
| 撤销后原会话与旧位置 | HTTP `original device denied after member removal / removed viewer cannot receive snapshot / trusted snapshot removes revoked publisher / rejoin cannot revive revoked lease`；原位置连接已换成 HTTP 租约，因此验证对象是原 session ID，非一个不存在的新协议位置 socket |
| 旧公共 WebSocket/HTTP 入口 | HTTP52 中真实旧 socket 冒名成功、隔离重启观察 socket close、五类角色旧 join 明确拒绝、HTTP broadcast 403；Deno guard 单测中的上游是 echo server，只证明过滤器，不冒充真实 Realtime |
| 断网停发/重连重授权 | 客户端25 中 `offline pauses location publication; reconnect reauthorizes rather than replaying queue`、`legal reconnect uses a fresh authorized session and new GPS fix`、后台/迟到请求/撤销读取测试；这些是 mock 生命周期测试。HTTP 中重新加入不能使用旧租约，fresh open 后正常发布、过期租约发布拒绝且从快照移除 |

**HTTP52 并没有覆盖正常位置的 WebSocket 接收；SQL45 不涉及网络；客户端25 使用 mock。新版位置用真实 HTTP 快照接收，不能写成 WebSocket 位置验收。** 新增必要的 guard 兼容验证：[真实 WS 补证](evidence/issue11-followup-realtime.txt)，6/0：两个真实 JWT 客户端经 guard 订阅 `journeys` UPDATE，从实际 WAL 收到相同提交；捕获入站帧均为 JSON；在同一活跃 socket 上旧 track 得明确 `legacy_location_disabled`，随后正常订阅仍接收更新；另确认已安装 SDK 的 JSON broadcast 编码确为 ArrayBuffer。没有 mock upstream。首次因隔离 Realtime 启动/seed 重启导致连接关闭而 exit 2，未算通过；加入真实上游就绪检查后最终 exit 0。

补证命令（只运行新增补证，跳过原 SQL45/HTTP52/旧邀请回归）：

```bash
KAIPA_ISSUE11_REPAIRED=1 KAIPA_ISSUE11_FOLLOWUP=1 KAIPA_ISSUE11_EVIDENCE_DIR=/tmp/kaipa-issue11-followup node scripts/qa/issue11-isolated.cjs
```

仍未验证：真机、实际 App 位置接收及地图/头像展示、系统真实断网/后台行为、并发多事务压力；补证不改变这些结论。

## 3. Guard 启用、隔离与旧连接排空

仓库交付包含可运行 guard、真实 WS/HTTP 拒绝测试、[受控启用步骤](../../infra/supabase/realtime-location-guard/README.md)，足以提供**待实施的实现与维护方案**，不构成共享服务已生效证明；没有自动完成全入口切换/防火墙/旧连接排空的部署集成。新补证 [拓扑记录](evidence/issue11-followup-isolation.txt) 实际检查 disposable network `Internal=true`、所有 upstream 与 gateway 容器无 host port bindings；guard 在隔离 gateway 启用。原 HTTP52 已实际重启隔离 Realtime 并观察旧连接断开。测试客户端和 host 管理员仍能访问隔离上游，这是复现直连绕过的受信测试路径，不是外部 ingress 封堵的生产证明。

**任何客户端能绕过 guard 直连 upstream，旧公共 Presence 就仍可冒名发布**；改 DNS、客户端或只加 guard 都不够。后续部署条件为 owner 明确授权维护窗口、阻断所有域名/端口/HTTP/WS ingress、upstream 仅私网、全部入口经 guard、阻断期间排空旧连接、用自托管脚本应用迁移和发布函数，再验证合法访问及拒绝矩阵后开放。共享 Kong+edge-runtime 完整拓扑、各 ingress 封堵和共享原 socket close 尚未验证，本任务不部署。

## 4. 二进制帧与现有 Realtime

代码搜索 `rg -n '\.channel\(|postgres_changes|broadcast' src` 对应四个调用点：`useJourneys`（journeys/companions）、`useJourneyPacking`（lists/items）、`useNotifications`、`useAgentRunRealtime`（runs/stages），全部是 `postgres_changes`，没有 broadcast send、自定义 serializer 或二进制配置。Supabase 客户端采用默认序列化；安装的 `@supabase/realtime-js` Serializer 在 v2 下把 **JSON broadcast 内容也包装为二进制**。因此 guard 会中止客户端 binary push，并丢弃上游 binary 输出；不能宣称支持所有 Realtime 协议或未来 broadcast。

本项目现有必要调用使用 JSON join/heartbeat/postgres_changes，新增真实 WAL 双客户端测试确认该路径经 guard 正常接收，不需要在本 issue 中扩展二进制解析器。未逐个制造 packing/notification/agent 表业务事件做完整回归，维护窗口仍需验收这些现有调用；若以后增加 broadcast，应先增加能识别 topic 并封堵旧频道的二进制支持，不能简单透传二进制绕过边界。

## 5. 40 秒与断网行为

40 秒是**服务端租约**：publish 以数据库时钟延长 `expires_at`；snapshot 排除到期租约，旧 session publish 也拒绝。约 3 秒是在线接收端轮询间隔，不是仅靠接收端本地 TTL 清理。到期后数据库行可能保留（后续 open 清理），但不再输出或接受旧会话发布。40+3 秒是正常网络/前台轮询条件下的时间预算，不保证设备挂起或网络延迟时的硬上界。

客户端检测 offline 后移除 GPS watcher、清空 `latest/lastSent/self pin`、废弃 publisher generation；publish 要求 `online && active`，无位置队列、无失败自动重发。pause 仍会尝试一次不含坐标的 close；断网前已发出的 HTTP 可能到达服务端，不能声称网络物理断开的瞬间零在途请求。重连创建 fresh publisher，先真实 Auth/membership open 成功，再读取缓存/开启 GPS；可能使用不超过 120 秒的系统 last-known fix，这是重新授权后的缓存读取，不是重放断网期间排队的位置，也不保证必为新的 GPS fix。mock 测试证明暂停后喂入离线坐标不会 publish；真实系统网络探测时延未测。

撤销成员由 DB trigger 同事务将旧租约 closed、坐标置空；每次 snapshot 同时过滤当前资格，原 viewer 下一次请求 403 并清空 peers，合法 viewer 下一次快照移除该人。重新加入也不能复活旧 session。撤销前已生成/在途的快照可能迟到，下次成功快照更正；不会延长数据库租约。

## 6. 改动规模与范围清理

`git diff --stat 3a6648afb5bbbce9ded361aa84099d89bfb5089f..9ce4cbc` 确为 31 文件、3497 增/897 删，不能以“小”掩盖协议替换规模。分组如下，计数均针对原交付，新增补证另计：

| 组 | 文件与增/删 | 两项漏洞的必要性 |
| --- | --- | --- |
| App 位置协议 | 4，332/505 | 移除自报公共 Presence；认证发布/可信接收/断网与重授权；保留原地图接口，未改 UI/导航 |
| SQL migrations | 2，274/0 | guest 共用期限及实际 Storage 触发器；服务端可信位置、成员校验、设备租约和撤销 |
| 函数/guard/guard test | 4，330/0 | Auth HTTP 入口、旧通道封堵、过滤回归；单独服务器检查，根 tsc 不覆盖 |
| 回归测试 | 2，723/392 | SQL 漏洞矩阵；旧 socket lifecycle 适配已批准的新租约协议，原 7 个 roster 断言与阈值保留，新增竞态测试 |
| 隔离 harness | 4，1094/0 | schema-only 隔离 Auth/Storage/Realtime 与真实 HTTP/WS，避免写共享服务；保留原漏洞复现 |
| 证据 | 13，659/0 | 原失败与修复后原始结果，较长既有邀请 SQL 输出，支持审查追溯 |
| 报告/维护步骤 | 2，85/0 | 方案批准、验收边界、未部署与旧连接切换条件 |

各组均对应授权修复/验收，未混入 #10 其他功能；未发现应删除的无关功能。已撤掉 `companionPresence.ts` 对未变逻辑的换行格式改动，进一步缩小 diff；不删测试/证据、不降阈值。本次新增脚本、隔离分支与证据仅用于真实 WS 兼容核实，未改变服务协议/API/CI。

— 🤖 Builder (Happy Agent)
