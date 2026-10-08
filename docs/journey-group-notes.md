# 行程组备注

备注为可选纯文本，与行程组标题同一行显示，使用较小、较淡的文字；超出宽度省略，多行内容在摘要中合并为一行。点击备注直接打开完整内容的编辑弹层，点击标题或箭头展开/收起行程，两者使用独立点击区域。没有备注时，标题右侧显示淡色「添加备注」占位文字，点击直接打开编辑弹层。编辑器最多输入 1000 字，清空后保存即删除。只读模式不显示添加占位。只读旅程和历史版本预览显示备注，点击可查看全文，但不提供编辑入口。

编辑弹层参考添加行程的地点搜索面板：全宽圆角面板紧贴键盘，左对齐标题，无边框纯文本输入，右侧高对比胶囊「确定」按钮。短备注保持紧凑，长备注输入区最多六行高度并可滚动；接近字数上限时显示计数。打开即聚焦，点击遮罩关闭，保存中禁止关闭和重复提交。

`src/components/journey/JourneyGroupNote.tsx` 负责占位入口、编辑弹层和文本展示；`useTimeline` 从 `timeline_groups.note` 读取备注，通过 `journey_save_timeline_group_note` 保存。保存失败保留编辑草稿，只在服务端成功后更新共享缓存。待计划组使用空字符串组键。

`supabase/migrations/20261008130000_timeline_group_notes.sql` 添加列和保存 RPC，并让改名携带备注；合并已有分组时按「目标备注、来源备注」保留两段文字，不截断。合并内容超过 1000 字时，下一次编辑保存需缩短至 1000 字以内。退休的组名清空备注，避免改回旧名称时重复拼接。

备注沿用现有行程版本触发器，快照通过整行 JSON 包含该字段，历史预览通过 `useTimeline` 读取。旧快照缺少该字段时显示为空。

应用到自托管数据库：

```bash
infra/supabase/apply-migration.sh supabase/migrations/20261008130000_timeline_group_notes.sql
```

验证：

```bash
npx tsc --noEmit
docker exec -i kaipa-supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/timeline-group-notes.sql
```

数据库测试覆盖空组/待计划保存、换行、清空、改名往返、合并、版本快照、字数限制、已删除组拒写，以及非所有者拒写。测试数据在同一事务内回滚。
