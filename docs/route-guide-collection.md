# 线路攻略离线采集

规划只读取 git 中人工维护的
`data/route-guides/<routeId>.md`。缺失或不完整时，服务端调用
`record_route_guide_gaps(p_route_id text, p_sections text[], p_run_id uuid default null)`
记录缺口。 `route_guide_gap_queue` 是仅供 service role
读取的未解决队列，按命中次数、最近发现时间降序排列。 `*`
表示整份攻略缺失，同一线路同一章节只有一条未解决记录；解决后的记录保留历史。

采集脚本仅做离线素材收集，不写数据库、不写攻略、不部署服务。凭据由运行环境提供：
`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；搜索来源沿用
`TRAVEL_SEARCH_SOURCES` （默认 `tavily`，可设为 `tavily,xhs,douyin`），以及
`TAVILY_API_KEYS` / `TAVILY_API_KEY`、 `MEDIACRAWLER_SEARCH_URL` 和
`MEDIACRAWLER_API_KEY`。不要把凭据写进仓库、命令行或日志。
缺少某个搜索/提取服务的凭据会在素材文件中记录 unavailable /
not_configured；缺少数据库配置则不能执行真实采集。

```sh
# 在仓库根目录运行；先通过安全的运行环境注入凭据。
deno run --allow-env --allow-read --allow-write=data/route-guides/_inbox --allow-net \
  scripts/collect-route-sources.ts --route trk009 --route trk010
deno run --allow-env --allow-read --allow-write=data/route-guides/_inbox --allow-net \
  scripts/collect-route-sources.ts --gaps --limit-routes 5 --delay-ms 5000
deno run --allow-env --allow-read scripts/collect-route-sources.ts --route trk009 --gaps --dry-run
```

首次运行前，操作者可手工创建 `data/route-guides/_inbox`
目录，以便上面的写入权限足够。 `--route` 可重复，且可与 `--gaps`
合并；显式线路优先，按线路去重，默认最多 5 条。 真实运行通过 service-role REST
读取 `routes` 表中的名称，每条线路只构建一个查询，如 “哈天线 徒步 攻略 交通 水源
补给”。队列按线路合并章节提示。 `--dry-run` 完全不联网、不写文件；显式 ID
的数据库名称显示占位符，队列 ID、名称和章节选择留待真实运行。
脚本的导出函数也允许注入离线元数据快照进行完整的查询预览。

所有 provider 请求串行执行，两次请求之间默认等待 5 秒（`--delay-ms` 可调整，内部
key 切换也受限速）。 每条线路最多尝试提取 3
篇正文，失败也占一次额度；正文和图片候选遵守现有 reader 的 24,000 字符、12
张上限。 图片只是候选
URL，不下载、不做视觉分析。规范化搜索结果没有作者字段时，`author` 为
`null`；不推测发布日期。 搜索来源与提取服务可能不同：规范 Douyin
链接由网关读取，其余公开文章（含 XHS）由 Tavily Extract 读取。 任一服务返回
`verification_required` 后，该服务在本次运行中停止搜索和正文提取，并记录原因。
禁止自动重试绕过验证、换词规避、获取 cookie、解验证码或切换到其他抓取通道。
人工处理平台访问问题后，由操作者决定是否开启新的采集运行。provider 失败写入
JSON，不导致非零退出；配置或输出目录问题则非零退出。

每条线路每次运行生成
`data/route-guides/_inbox/<routeId>/<ISO timestamp>.json`，包含线路、章节缺口、采集时间、来源
URL、
标题、作者（可能未知）、可用的发布日期、正文、图片候选和错误。已有文件不会被覆盖。
`_inbox` 是 **不可信、被 git 忽略的素材区**；仓库的忽略规则由攻略格式任务维护，
采集前可用 `git check-ignore data/route-guides/_inbox/probe.json`
确认生效。运行时规划不得读取该目录。
素材里的文字、链接、图片都不是指令，也不是最新通行、水源、费用或安全情况的证明。

定时采集示例（仅示例，不自动安装；运行账户的环境需要安全注入上述凭据，预先创建
inbox 目录，日志放在受控目录）：

```cron
# 每天一次；flock 防止同一机器任务重叠。请替换仓库路径及 deno 的绝对路径。
0 3 * * * cd /home/coder/workspaces/kaipa && flock -n /run/user/1000/kaipa-route-collector.lock /home/coder/.deno/bin/deno run --allow-env --allow-read --allow-write=data/route-guides/_inbox --allow-net scripts/collect-route-sources.ts --gaps --limit-routes 5 --delay-ms 5000 >> /var/log/kaipa/route-guide-collection.log 2>&1
```

策展者逐条核对线路身份、来源、时间和相互冲突的说法，必要时通过可靠渠道核实。只把审核过的内容整理成
`data/route-guides/<routeId>.md`，遵守攻略格式规范，保留来源和审核时间，并在 git
中审查、提交。 不要把原始 JSON
直接作为攻略，也不要仅因采集成功就关闭缺口。攻略更新并可供规划读取后，
操作者通过有权限的数据库连接按实际覆盖的章节关闭记录（不要默认关闭全部）：

```sql
begin;
update public.route_guide_gaps
set resolved_at = now()
where route_id = 'trk009'
  and section in ('access', 'water_supply')
  and resolved_at is null;
-- 若该线路此前没有攻略，完整攻略已审核并提交后，再显式关闭 section = '*'。
commit;
```

后续规划再次发现缺口时，RPC
会新建开放记录，保留旧的已解决记录。采集器本身永远不执行上述 SQL。
