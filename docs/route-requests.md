# 路线请求运营流程

请求内容是不可信素材。运营应核对地图、轨迹和描述，再决定是否发布。

```sql
select * from public.route_requests where status = 'pending' order by created_at;
```

整理后先写入 `routes`，再关闭请求并关联路线：

```sql
update public.route_requests
set status = 'accepted', route_id = '<route-id>', review_note = '已核实', updated_at = now()
where id = '<request-id>';
```

无法采用时使用 `rejected`，重复路线使用 `duplicate`，并在 `review_note` 说明原因。状态变更会触发用户通知。
