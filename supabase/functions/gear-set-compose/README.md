# gear-set-compose Edge Function

新建 / 编辑清单页「按描述搭配」的服务端。客户端发来描述、分类和装备库，
函数调用一次模型，只返回草稿：

- `picks`：从用户装备库里挑的装备 ID（不含用户已选或已移除的）；
- `missing`：这次需要、但库里没有的装备，带分类和一句理由，最多 8 件；
- `name`、`summary`：建议的清单名和一句挑选思路。

函数不写数据库。用户在编辑页确认后，App 才保存清单，并把勾选的缺项建成
`owned = false` 的待购装备。见 `docs/agent-gear-sets.md`。

模型默认依次取 `GEAR_SET_AI_MODEL`、`KAIPA_AI_FLASH_MODEL`、`KAIPA_AI_MODEL`。
每次调用计入 `ai_requests` 月额度，限流沿用 `ai` 范围。

```bash
infra/supabase/deploy-functions.sh gear-set-compose
```
