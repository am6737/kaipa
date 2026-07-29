-- kaipa seed data — mirrors the hardcoded mock arrays.
-- Test user: test@kaipa.app / kaipa123  (id = 9bc22e65-7352-4936-8f8a-68d02c88a403)

do $$
declare
  uid uuid := '9bc22e65-7352-4936-8f8a-68d02c88a403';
  pack_id text;
  shelter_id text;
  sleep_id text;
  cloth_id text;
  cook_id text;
  elec_id text;
  safe_id text;
  misc_id text;
begin

-- ─── routes (EXPLORE_POIS) ──────────────────────────────────────────────────
insert into routes (id, name, region, coord, lng, lat, dist, asc_, diff, rating, reviews, tone, "desc") values
  ('e1', '九溪烟树', '杭州 · 西湖', '30.21 N · 120.10 E', 120.1, 30.21, '6.2 km', '+120 m', '易', '4.8', 312, 'forest', '西湖群山里最温柔的一段溪谷线，沿九溪十八涧一路下行，春茶时节最佳。适合作为城市周末的轻徒步。'),
  ('e2', '武功山金顶穿越', '江西 · 萍乡', '27.46 N · 114.17 E', 114.17, 27.46, '24.6 km', '+1,640 m', '中高', '4.9', 1208, 'ridge', '十万亩高山草甸，云海与日出的经典三日线。金顶到发云界一路起伏，注意山顶天气多变。'),
  ('e3', '贡嘎西坡转山', '四川 · 甘孜', '29.59 N · 101.88 E', 101.88, 29.59, '38.4 km', '+2,980 m', '高', '4.7', 642, 'snow', '近距离仰望蜀山之王的高海拔重装线，翻越日乌且垭口需做好高反准备。沿途冰川与海子壮丽。'),
  ('e4', '太白山鳌太段', '陕西 · 宝鸡', '33.95 N · 107.76 E', 107.76, 33.95, '18.9 km', '+1,320 m', '中高', '4.6', 388, 'rock', '秦岭主脊上的石海与冷杉林，拔仙台俯瞰云海。气候多变，务必关注天气窗口。'),
  ('e5', '哈巴雪山大本营', '云南 · 香格里拉', '27.36 N · 100.10 E', 100.1, 27.36, '9.8 km', '+980 m', '中', '4.8', 521, 'moss', '从哈巴村到大本营的入门级雪山徒步，杜鹃林与高山牧场交替，是攀登前的经典适应线。'),
  ('e6', '雨崩神瀑', '云南 · 德钦', '28.40 N · 98.85 E', 98.85, 28.4, '14.2 km', '+760 m', '中', '4.9', 2033, 'river', '梅里雪山脚下的转山支线，神瀑、冰湖与原始森林。村落住宿便利，适合四到五天慢走。'),
  ('e7', '玉龙雪山云杉坪', '云南 · 丽江', '27.10 N · 100.19 E', 100.19, 27.1, '5.4 km', '+320 m', '易', '4.5', 1840, 'dusk', '云杉坪高山草甸与雪山倒影，海拔不高但景观出片。适合带家人的半日徒步。'),
  ('e8', '长白山西坡', '吉林 · 白山', '42.00 N · 128.06 E', 128.06, 42.0, '11.6 km', '+640 m', '中', '4.7', 970, 'night', '西坡阶梯通往天池，火山地貌与高山花海。夏季云开见池的概率更高。')
on conflict (id) do nothing;

-- ─── journeys (MEMORY_POIS) ─────────────────────────────────────────────────
insert into journeys (id, user_id, route_id, name, region, coord, lng, lat, dist, asc_, tone, "desc", date, days, planned_date, countdown, day_index, total_days, fav) values
  ('m1', uid, null, '四姑娘二峰', '四川 · 阿坝', '31.10 N · 102.90 E', 102.9, 31.1, '18.4 km', '+2,140 m', 'snow', '六月的二峰雪线还在，计划三天完成大本营适应与冲顶。重点准备高海拔保暖与冰爪。', '2026 · 6 月', '3 天', '6 月 24 日', 14, null, 3, true),
  ('m2', uid, 'e2', '武功山三日穿越', '江西 · 萍乡', '27.46 N · 114.17 E', 114.17, 27.46, '24.6 km', '+1,640 m', 'ridge', '正走在金顶到发云界的草甸上，昨夜扎营看到了完整的银河。今天目标是绝望坡前的营地。', '记录到 Day 2/3', '3 天', null, null, 2, 3, false),
  ('m3', uid, 'e3', '贡嘎西坡转山', '四川 · 甘孜', '29.59 N · 101.88 E', 101.88, 29.59, '38.4 km', '+2,980 m', 'snow', '翻越日乌且垭口那天遇到了完美的日照金山。五天高海拔重装，是迄今最难也最难忘的一段。', '2025 · 10 月', '5 天', null, null, null, 5, true),
  ('m4', uid, 'e6', '雨崩神瀑', '云南 · 德钦', '28.40 N · 98.85 E', 98.85, 28.4, '14.2 km', '+760 m', 'river', '从西当温泉一路走到神瀑，雨季的森林格外通透。住在雨崩下村，慢悠悠走了四天。', '2025 · 5 月', '4 天', null, null, null, 4, false),
  ('m5', uid, 'e5', '哈巴雪山大本营', '云南 · 香格里拉', '27.36 N · 100.10 E', 100.1, 27.36, '9.8 km', '+980 m', 'moss', '独行的一次适应性徒步，从哈巴村慢慢爬到大本营。云海在脚下翻涌，安静得只剩风声。', '2024 · 11 月', '2 天', null, null, null, 2, false)
on conflict (id) do nothing;

-- ─── companions ──────────────────────────────────────────────────────────────
-- m1: 四姑娘二峰
insert into companions (journey_id, ini, name, role, color, trips, is_host, sort_order) values
  ('m1', '林', '林夕', '领队', '#FF5C3A', 5, true, 0),
  ('m1', '周', '老周', null, '#0A84FF', 2, false, 1),
  ('m1', 'M', 'Mia', null, '#FF9F0A', 1, false, 2),
  ('m1', '赵', '赵磊', null, '#34C759', 3, false, 3);

-- m2: 武功山三日穿越
insert into companions (journey_id, ini, name, role, color, is_host, sort_order) values
  ('m2', '林', '林深见鹿', '领队', '#2E7D5B', true, 0),
  ('m2', '周', '老周', null, '#0A84FF', false, 1),
  ('m2', 'M', 'Mia', null, '#FF9F0A', false, 2);

-- m3: 贡嘎西坡转山
insert into companions (journey_id, ini, name, role, color, is_host, sort_order) values
  ('m3', '林', '林夕', '领队', '#FF5C3A', true, 0),
  ('m3', '周', '老周', null, '#0A84FF', false, 1),
  ('m3', 'M', 'Mia', null, '#FF9F0A', false, 2),
  ('m3', '雪', '雪线之上', null, '#5E5CE6', false, 3),
  ('m3', 'J', 'Jay', null, '#64D2FF', false, 4);

-- m4: 雨崩神瀑
insert into companions (journey_id, ini, name, color, is_self, is_host, sort_order) values
  ('m4', '陈', '陈泽宇', '#FF7A55', true, true, 0),
  ('m4', '周', '老周', '#0A84FF', false, false, 1);

-- m5: 哈巴雪山大本营
insert into companions (journey_id, ini, name, color, is_self, is_host, sort_order) values
  ('m5', '陈', '陈泽宇', '#FF7A55', true, true, 0);

-- ─── gear_categories ────────────────────────────────────────────────────────
-- New profiles receive editable default categories from the profile trigger.
select id into pack_id from gear_categories where user_id = uid and name = '背负系统' limit 1;
select id into shelter_id from gear_categories where user_id = uid and name = '庇护系统' limit 1;
select id into sleep_id from gear_categories where user_id = uid and name = '睡眠系统' limit 1;
select id into cloth_id from gear_categories where user_id = uid and name = '服饰系统' limit 1;
select id into cook_id from gear_categories where user_id = uid and name = '饮食系统' limit 1;
select id into elec_id from gear_categories where user_id = uid and name = '电子导航' limit 1;
select id into safe_id from gear_categories where user_id = uid and name = '安全急救' limit 1;
select id into misc_id from gear_categories where user_id = uid and name = '其他' limit 1;

-- ─── gear_items ──────────────────────────────────────────────────────────────
insert into gear_items (user_id, name, cat_id, weight, price, qty, attrs) values
  (uid, 'Osprey Talon 33', pack_id, 0.86, 1100, 1, '[["容量","33 L"],["尺码","S/M"],["颜色","岩灰"]]'),
  (uid, 'HMG 2400 Southwest', pack_id, 0.78, 2980, 1, '[["容量","40 L"]]'),
  (uid, '攻顶包 18L', pack_id, 0.32, 320, 1, null),
  (uid, 'Big Agnes Copper Spur HV UL2', shelter_id, 1.32, 3380, 1, '[["人数","2P"]]'),
  (uid, 'MSR 地钉 ×8', shelter_id, 0.12, 160, 1, null),
  (uid, '地布 Tyvek', shelter_id, 0.18, 120, 1, null),
  (uid, 'Nemo Disco 15 羽绒睡袋', sleep_id, 0.96, 2200, 1, '[["温标","-9°C"]]'),
  (uid, 'Therm-a-Rest NeoAir XLite', sleep_id, 0.35, 1480, 1, '[["R 值","4.2"]]'),
  (uid, '充气枕', sleep_id, 0.08, 120, 1, null),
  (uid, 'Arc''teryx Beta AR 冲锋衣', cloth_id, 0.44, 4200, 1, '[["尺码","M"],["颜色","黑"]]'),
  (uid, 'Patagonia Nano Puff 棉服', cloth_id, 0.34, 1680, 1, null),
  (uid, '抓绒中层', cloth_id, 0.3, 680, 1, null),
  (uid, '速干裤', cloth_id, 0.28, 520, 2, null),
  (uid, '羊毛袜', cloth_id, 0.06, 120, 3, null),
  (uid, 'MSR PocketRocket 2 炉头', cook_id, 0.073, 360, 1, null),
  (uid, 'TOAKS 钛锅 750ml', cook_id, 0.103, 280, 1, null),
  (uid, '气罐 230g', cook_id, 0.36, 45, 2, null),
  (uid, '钛勺', cook_id, 0.018, 60, 1, null),
  (uid, 'Garmin inReach Mini 2', elec_id, 0.1, 3280, 1, '[["卫星通讯","是"]]'),
  (uid, '头灯 Petzl Actik Core', elec_id, 0.075, 420, 1, null),
  (uid, '充电宝 20000mAh', elec_id, 0.34, 260, 1, null),
  (uid, 'GPS 手表 Fenix 7', elec_id, 0.079, 5180, 1, null),
  (uid, '急救包', safe_id, 0.28, 280, 1, null),
  (uid, '登山杖 一对', safe_id, 0.46, 680, 1, null),
  (uid, '哨子 + 指北针', safe_id, 0.04, 90, 1, null),
  (uid, '防晒霜 + 唇膏', misc_id, 0.12, 160, 1, null),
  (uid, '驱蚊液', misc_id, 0.1, 60, 1, null),
  (uid, '湿巾 + 垃圾袋', misc_id, 0.15, 40, 1, null);

-- ─── gear_sets + gear_set_items ─────────────────────────────────────────────
insert into gear_sets (id, user_id, name) values
  ('s1', uid, '高海拔三天两夜'),
  ('s2', uid, '低海拔轻徒步'),
  ('s3', uid, '雪山技术线'),
  ('s4', uid, '摄影露营')
on conflict (id) do nothing;

-- Link sets to items by name
insert into gear_set_items (set_id, item_id)
select 's1', id from gear_items where user_id = uid and name in ('HMG 2400 Southwest', 'Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', 'Therm-a-Rest NeoAir XLite', 'Arc''teryx Beta AR 冲锋衣', 'MSR PocketRocket 2 炉头', 'Garmin inReach Mini 2', '急救包');

insert into gear_set_items (set_id, item_id)
select 's2', id from gear_items where user_id = uid and name in ('Osprey Talon 33', '速干裤', '抓绒中层', 'TOAKS 钛锅 750ml', '头灯 Petzl Actik Core');

insert into gear_set_items (set_id, item_id)
select 's3', id from gear_items where user_id = uid and name in ('HMG 2400 Southwest', 'Arc''teryx Beta AR 冲锋衣', 'Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', '登山杖 一对', '急救包', 'Garmin inReach Mini 2');

insert into gear_set_items (set_id, item_id)
select 's4', id from gear_items where user_id = uid and name in ('Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', 'GPS 手表 Fenix 7', '充电宝 20000mAh', 'TOAKS 钛锅 750ml');

-- ─── notifications ──────────────────────────────────────────────────────────
insert into notifications (id, user_id, kind, cat, bucket, time, who, avatar, color, verb, target, target_id, action, thumb) values
  ('n1', uid, 'invite', 'social', 'today',    '刚刚',      '林深见鹿', '林', '#2E7D5B', '邀请你加入旅程', '贡嘎西坡转山', 'm3', '查看', 'snow'),
  ('n2', uid, 'join',   'social', 'today',    '25 分钟前',  '老周',     '周', '#0A84FF', '加入了你发起的', '武功山三日穿越', 'm2', '查看', 'ridge'),
  ('n3', uid, 'photo',  'social', 'today',    '2 小时前',   'Mia',      'M',  '#FF9F0A', '在旅程里上传了 8 张照片', '武功山三日穿越', 'm2', '查看', 'forest'),
  ('n4', uid, 'like',   'social', 'earlier',  '昨天',       '雪线之上',  '雪', '#5E5CE6', '赞了你的路线', '哈巴雪山大本营', 'e5', '查看', null),
  ('n5', uid, 'safety', 'system', 'earlier',  '2 天前',     null,       null, null,      '武功山区域将有强降雨，注意行程安全', null, null, '了解', null),
  ('n6', uid, 'system', 'system', 'earlier',  '3 天前',     null,       null, null,      'kaipa 1.2 已更新：装备库支持批量识别', null, null, '了解', null);

-- ─── timeline_rows (SYNTH entries for each journey) ─────────────────────────
-- m1 timeline
insert into timeline_rows (id, journey_id, user_id, title, day, is_synth, checked, sort_order) values
  ('m1-i-map',  'm1', uid, '保存离线地图',         'pre',  true, true,  0),
  ('m1-i-book', 'm1', uid, '确认营地预订',         'pre',  true, false, 1),
  ('m1-i-wx',   'm1', uid, '出发前查看天气窗口',    'pre',  true, false, 2),
  ('m1-i-fam',  'm1', uid, '给家人留一份行程',      'pre',  true, false, 3),
  ('m1-i-camp', 'm1', uid, '日落前抵达营地',        'D1',   true, false, 4),
  ('m1-i-water','m1', uid, '营地旁有溪水，可补给',   'D1',   true, false, 5),
  ('m1-i-fuel', 'm1', uid, '冲顶前补充能量',        'D2',   true, false, 6),
  ('m1-i-sun',  'm1', uid, '在主峰看日出',          'D2',   true, false, 7),
  ('m1-i-knee', 'm1', uid, '下撤路滑，注意膝盖',    'D3',   true, false, 8),
  ('m1-i-up',   'm1', uid, '上传轨迹与照片',        'post', true, false, 9);

-- m2 timeline (day 2 — pre + D1 checked)
insert into timeline_rows (id, journey_id, user_id, title, day, media, is_synth, checked, sort_order) values
  ('m2-i-map',  'm2', uid, '保存离线地图',         'pre',  null,  true, true,  0),
  ('m2-i-book', 'm2', uid, '确认营地预订',         'pre',  null,  true, true,  1),
  ('m2-i-wx',   'm2', uid, '出发前查看天气窗口',    'pre',  null,  true, true,  2),
  ('m2-i-fam',  'm2', uid, '给家人留一份行程',      'pre',  null,  true, true,  3),
  ('m2-i-camp', 'm2', uid, '日落前抵达营地',        'D1',   null,  true, true,  4),
  ('m2-i-water','m2', uid, '营地旁有溪水，可补给',   'D1',   '[{"tone":"river"}]', true, true, 5),
  ('m2-i-fuel', 'm2', uid, '冲顶前补充能量',        'D2',   null,  true, false, 6),
  ('m2-i-sun',  'm2', uid, '在主峰看日出',          'D2',   '[{"tone":"dusk"},{"tone":"snow","video":true}]', true, false, 7),
  ('m2-i-knee', 'm2', uid, '下撤路滑，注意膝盖',    'D3',   null,  true, false, 8),
  ('m2-i-up',   'm2', uid, '上传轨迹与照片',        'post', null,  true, false, 9);

-- m3 timeline (all checked)
insert into timeline_rows (id, journey_id, user_id, title, day, media, is_synth, checked, sort_order) values
  ('m3-i-map',  'm3', uid, '保存离线地图',         'pre',  null,  true, true, 0),
  ('m3-i-book', 'm3', uid, '确认营地预订',         'pre',  null,  true, true, 1),
  ('m3-i-wx',   'm3', uid, '出发前查看天气窗口',    'pre',  null,  true, true, 2),
  ('m3-i-fam',  'm3', uid, '给家人留一份行程',      'pre',  null,  true, true, 3),
  ('m3-i-camp', 'm3', uid, '日落前抵达营地',        'D1',   null,  true, true, 4),
  ('m3-i-water','m3', uid, '营地旁有溪水，可补给',   'D1',   '[{"tone":"river"}]', true, true, 5),
  ('m3-i-fuel', 'm3', uid, '冲顶前补充能量',        'D2',   null,  true, true, 6),
  ('m3-i-sun',  'm3', uid, '在主峰看日出',          'D2',   '[{"tone":"dusk"},{"tone":"snow","video":true}]', true, true, 7),
  ('m3-i-knee', 'm3', uid, '下撤路滑，注意膝盖',    'D3',   null,  true, true, 8),
  ('m3-i-up',   'm3', uid, '上传轨迹与照片',        'post', null,  true, true, 9);

-- m4 + m5 timelines (all checked)
insert into timeline_rows (id, journey_id, user_id, title, day, is_synth, checked, sort_order) values
  ('m4-i-map',  'm4', uid, '保存离线地图',         'pre',  true, true, 0),
  ('m4-i-book', 'm4', uid, '确认营地预订',         'pre',  true, true, 1),
  ('m4-i-wx',   'm4', uid, '出发前查看天气窗口',    'pre',  true, true, 2),
  ('m4-i-fam',  'm4', uid, '给家人留一份行程',      'pre',  true, true, 3),
  ('m4-i-camp', 'm4', uid, '日落前抵达营地',        'D1',   true, true, 4),
  ('m4-i-water','m4', uid, '营地旁有溪水，可补给',   'D1',   true, true, 5),
  ('m4-i-fuel', 'm4', uid, '冲顶前补充能量',        'D2',   true, true, 6),
  ('m4-i-sun',  'm4', uid, '在主峰看日出',          'D2',   true, true, 7),
  ('m4-i-knee', 'm4', uid, '下撤路滑，注意膝盖',    'D3',   true, true, 8),
  ('m4-i-up',   'm4', uid, '上传轨迹与照片',        'post', true, true, 9),
  ('m5-i-map',  'm5', uid, '保存离线地图',         'pre',  true, true, 0),
  ('m5-i-book', 'm5', uid, '确认营地预订',         'pre',  true, true, 1),
  ('m5-i-wx',   'm5', uid, '出发前查看天气窗口',    'pre',  true, true, 2),
  ('m5-i-fam',  'm5', uid, '给家人留一份行程',      'pre',  true, true, 3),
  ('m5-i-camp', 'm5', uid, '日落前抵达营地',        'D1',   true, true, 4),
  ('m5-i-water','m5', uid, '营地旁有溪水，可补给',   'D1',   true, true, 5),
  ('m5-i-fuel', 'm5', uid, '冲顶前补充能量',        'D2',   true, true, 6),
  ('m5-i-sun',  'm5', uid, '在主峰看日出',          'D2',   true, true, 7),
  ('m5-i-knee', 'm5', uid, '下撤路滑，注意膝盖',    'D3',   true, true, 8),
  ('m5-i-up',   'm5', uid, '上传轨迹与照片',        'post', true, true, 9);

end $$;
