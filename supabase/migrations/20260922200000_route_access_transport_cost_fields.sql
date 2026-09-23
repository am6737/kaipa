begin;

-- Transportation references commonly contain the fare next to the departure
-- method and schedule. Keep the dedicated shuttle_cost category for standalone
-- price records, but let an access_transport entry retain its own fare context.
update public.route_fact_categories
set description = '怎么到这条线路的起点、怎么离开，包括班次、耗时和费用参考',
    field_schema = '[
      {"key":"from","label":"出发地","type":"text","required":true},
      {"key":"to","label":"到达节点","type":"text","required":true},
      {"key":"mode","label":"交通方式","type":"select","options":["班车","拼车","包车","自驾","其他"]},
      {"key":"schedule","label":"班次与时间","type":"text"},
      {"key":"duration","label":"耗时","type":"text"},
      {"key":"price_min","label":"最低价","type":"number","unit":"元"},
      {"key":"price_max","label":"最高价","type":"number","unit":"元"},
      {"key":"unit","label":"计价单位","type":"select","options":["每人","每车","每天","每次"]},
      {"key":"effective_season","label":"适用季节","type":"text"},
      {"key":"notes","label":"备注","type":"markdown"}
    ]'::jsonb,
    updated_at = now()
where slug = 'access_transport';

commit;
