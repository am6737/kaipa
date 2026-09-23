begin;

-- Seed only structured drafts that can be traced to the existing guide/search
-- cache. These are intentionally suggested, not confirmed: the cached sources
-- disagree on several prices, durations and elevations and need human review.
insert into public.route_fact_entries
  (route_id, category_slug, title, fields, source_url, status, origin)
select * from (values
  (
    'trk008', 'itinerary', '党岭三湖连穿：时长与分段（缓存草稿）',
    '{"days":"1日精华或2日分段，取决于走法与体力","distance":"目录GPX 19.5 km","max_altitude":4650,"difficulty":"高强度","day_plan":"缓存中同时出现党岭村→葫芦海→卓雍措的单日走法，以及10 km适应段+16 km三湖段的团队行程；不能直接作为固定日程。"}'::jsonb,
    'https://hk.trip.com/moments/detail/danba-704-137770326', 'suggested', 'agent'
  ),
  (
    'trk008', 'access_transport', '成都—丹巴—党岭村交通（缓存草稿）',
    '{"from":"成都","to":"党岭村","mode":"包车","duration":"成都至丹巴约5—8小时；丹巴至党岭约1.5—3小时","notes":"不同缓存来源给出的总时长、末段路况和距离不一致；多次提到丹巴后需拼车或包车进村，最后一段山路建议SUV/越野车，具体班次和当日路况需复核。"}'::jsonb,
    'https://hk.trip.com/moments/poi-dangling-village-80961', 'suggested', 'agent'
  ),
  (
    'trk008', 'shuttle_cost', '党岭村—葫芦海摩托/马帮（缓存草稿）',
    '{"item":"党岭村至葫芦海的摩托车或马帮代步","price_min":150,"price_max":200,"unit":"每人","effective_season":"平日与节假日可能不同","notes":"缓存中同时出现单程上行约150—200元/人、下行约100—150元/人及节假日上浮说法；不可视为当前报价，需向当地客栈或马帮确认。"}'::jsonb,
    'https://www.2bulu.com/mc/community/detail?id=75985058', 'suggested', 'agent'
  ),
  (
    'trk008', 'campsite', '葫芦海帐篷营地（缓存草稿）',
    '{"name":"葫芦海帐篷营地","location":"葫芦海湖畔或附近","notes":"缓存提到帐篷住宿约200元/晚，并出现提供睡袋、被子的说法；营地是否常年开放、价格、容量和水源均需现场确认，不应据此安排无补给露营。"}'::jsonb,
    'https://you.ctrip.com/travels/sichuan100009/4149978.html', 'suggested', 'agent'
  ),
  (
    'trk008', 'season_safety', '党岭季节与风险（缓存草稿）',
    '{"best_months":"5—6月、9—10月；不同来源对最佳窗口表述不一致","hazards":"高海拔、垭口雨雪、泥泞和下撤时间压力；雨天可能显著增加风险，山上信号弱","resupply":"部分来源提到飞机坪或葫芦海附近可能有小卖部/简易补给，但不稳定，建议按无补给准备","notes":"最佳月份、补给点和开放状态均是攻略历史描述，出发前需核实天气、道路和当地管理要求。"}'::jsonb,
    'https://www.2bulu.com/mc/community/detail?id=75985058', 'suggested', 'agent'
  ),
  (
    'trk065', 'campsite', '雅拉友措—热浪谷营地（缓存草稿）',
    '{"name":"雅拉友措/热浪谷营地","location":"雅拉温泉线分段营地，来源对营地名称和位置称谓不完全一致","altitude":4060,"notes":"缓存正文记录过约3980—4060米的营地海拔，并提到溪流或湖边水源；具体营地对应关系、水质、容量和是否允许露营需现场确认，不能直接当作稳定水源。"}'::jsonb,
    'https://www.233leyuan.com/post-detail/2067414281471557632', 'suggested', 'agent'
  ),
  (
    'trk065', 'season_safety', '雅拉温泉线高海拔与天气风险（缓存草稿）',
    '{"best_months":"缓存涉及春季、夏季和秋季，未形成一致窗口","hazards":"高海拔垭口、雨雪、碎石下坡和涉水过河；天气变化可能导致路线或营地调整","resupply":"重装线路应按自带水和食物规划，沿途水源需过滤并现场确认","notes":"本条来自历史游记，不代表当前开放状态或安全认证；出发前应核实景区预约、道路、天气和当地向导信息。"}'::jsonb,
    'https://www.2bulu.com/community/gotohuatinfo.htm?id=75624576', 'suggested', 'agent'
  )
) as seeded(route_id, category_slug, title, fields, source_url, status, origin)
where not exists (
  select 1 from public.route_fact_entries existing
  where existing.route_id = seeded.route_id
    and existing.category_slug = seeded.category_slug
    and existing.title = seeded.title
);

commit;
