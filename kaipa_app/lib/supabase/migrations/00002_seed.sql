-- ============================================================
-- Kaipa Seed Data — Realistic Beijing Hiking Routes
-- ============================================================

DO $$
DECLARE
  -- Demo user
  v_demo_user   uuid := '00000000-0000-0000-0000-000000000001';

  -- Route UUIDs
  v_route_jiankou   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_route_yunmeng   uuid := 'a0000000-0000-0000-0000-000000000002';
  v_route_haituo    uuid := 'a0000000-0000-0000-0000-000000000003';
  v_route_shisanling uuid := 'a0000000-0000-0000-0000-000000000004';
  v_route_xiangshan uuid := 'a0000000-0000-0000-0000-000000000005';
  v_route_lingshan  uuid := 'a0000000-0000-0000-0000-000000000006';

  -- Gear category UUIDs
  v_cat_boot      uuid := 'b0000000-0000-0000-0000-000000000001';
  v_cat_backpack  uuid := 'b0000000-0000-0000-0000-000000000002';
  v_cat_jacket    uuid := 'b0000000-0000-0000-0000-000000000003';
  v_cat_tent      uuid := 'b0000000-0000-0000-0000-000000000004';
  v_cat_bottle    uuid := 'b0000000-0000-0000-0000-000000000005';
  v_cat_battery   uuid := 'b0000000-0000-0000-0000-000000000006';
  v_cat_light     uuid := 'b0000000-0000-0000-0000-000000000007';
  v_cat_knife     uuid := 'b0000000-0000-0000-0000-000000000008';
  v_cat_socks     uuid := 'b0000000-0000-0000-0000-000000000009';
  v_cat_shield    uuid := 'b0000000-0000-0000-0000-000000000010';

  -- Gear item UUIDs
  v_gear1  uuid := 'c0000000-0000-0000-0000-000000000001';
  v_gear2  uuid := 'c0000000-0000-0000-0000-000000000002';
  v_gear3  uuid := 'c0000000-0000-0000-0000-000000000003';
  v_gear4  uuid := 'c0000000-0000-0000-0000-000000000004';
  v_gear5  uuid := 'c0000000-0000-0000-0000-000000000005';
  v_gear6  uuid := 'c0000000-0000-0000-0000-000000000006';
  v_gear7  uuid := 'c0000000-0000-0000-0000-000000000007';
  v_gear8  uuid := 'c0000000-0000-0000-0000-000000000008';
  v_gear9  uuid := 'c0000000-0000-0000-0000-000000000009';
  v_gear10 uuid := 'c0000000-0000-0000-0000-000000000010';
  v_gear11 uuid := 'c0000000-0000-0000-0000-000000000011';
  v_gear12 uuid := 'c0000000-0000-0000-0000-000000000012';
  v_gear13 uuid := 'c0000000-0000-0000-0000-000000000013';

  -- Achievement UUIDs
  v_ach1 uuid := 'd0000000-0000-0000-0000-000000000001';
  v_ach2 uuid := 'd0000000-0000-0000-0000-000000000002';
  v_ach3 uuid := 'd0000000-0000-0000-0000-000000000003';
  v_ach4 uuid := 'd0000000-0000-0000-0000-000000000004';
  v_ach5 uuid := 'd0000000-0000-0000-0000-000000000005';
  v_ach6 uuid := 'd0000000-0000-0000-0000-000000000006';

  -- Trip UUIDs
  v_trip1 uuid := 'e0000000-0000-0000-0000-000000000001';
  v_trip2 uuid := 'e0000000-0000-0000-0000-000000000002';
  v_trip3 uuid := 'e0000000-0000-0000-0000-000000000003';

  -- Review UUIDs
  v_review1 uuid := 'f0000000-0000-0000-0000-000000000001';
  v_review2 uuid := 'f0000000-0000-0000-0000-000000000002';

BEGIN

  -- ==========================================================
  -- Demo user profile
  -- ==========================================================
  INSERT INTO profiles (id, username, display_name, avatar_url, bio, difficulty_preference, total_distance_km, total_elevation_m, total_trips, joined_at)
  VALUES (
    v_demo_user,
    'mountain_explorer',
    '山野探索者',
    'https://example.com/avatars/demo.jpg',
    '热爱户外徒步，周末常在北京周边探索野长城和高山。目标是走遍北京所有经典路线！',
    'hard',
    156.8,
    8920,
    12,
    '2024-06-15T08:00:00Z'
  );

  -- ==========================================================
  -- Routes (6 Beijing hiking routes)
  -- ==========================================================

  -- 1. 箭扣长城 (hard)
  INSERT INTO routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, tags, elevation_profile, photo_spots)
  VALUES (
    v_route_jiankou, v_demo_user,
    '箭扣长城',
    '箭扣长城是北京最险峻的野长城段落之一，因整段长城蜿蜒呈W状如同满弓扣箭而得名。途经北京结、鹰飞倒仰、天梯等著名险段，沿途风光壮丽，是户外爱好者的经典挑战路线。需要一定的攀岩经验和体能。',
    12.5, 860, '6 hours', 'hard', 'YDS Class 3',
    4.5, 2,
    40.4758, 116.5653, '北京怀柔', 1044,
    false, '公交H25至西栅子村下车，步行约40分钟至长城入口',
    ARRAY['长城', '野长城', '攀岩', '怀柔', '经典'],
    '[{"distance":0,"elevation":540},{"distance":1.5,"elevation":680},{"distance":3.0,"elevation":820},{"distance":4.5,"elevation":960},{"distance":6.0,"elevation":1044},{"distance":7.5,"elevation":980},{"distance":9.0,"elevation":850},{"distance":10.5,"elevation":720},{"distance":12.5,"elevation":540}]',
    '[{"latitude":40.4762,"longitude":116.5648,"name":"北京结","description":"三段长城交汇的壮观节点，可俯瞰三个方向的长城"},{"latitude":40.4780,"longitude":116.5670,"name":"鹰飞倒仰","description":"近乎垂直的陡峭段落，需要手脚并用攀爬"},{"latitude":40.4795,"longitude":116.5690,"name":"天梯","description":"连续陡峭台阶，拍摄长城蜿蜒的最佳位置"}]'
  );

  -- 2. 云蒙山主峰 (moderate)
  INSERT INTO routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, tags, elevation_profile, photo_spots)
  VALUES (
    v_route_yunmeng, v_demo_user,
    '云蒙山主峰',
    '云蒙山是北京东北部的重要山峰，海拔1414米，植被丰富，四季景色各异。秋季红叶满山，冬季银装素裹。登山步道维护良好，沿途有多处休息平台，适合有一定经验的徒步者。',
    15.2, 1050, '7 hours', 'moderate', NULL,
    4.2, 0,
    40.5836, 116.7425, '北京密云', 1414,
    true, '东直门乘坐980路至密云汽车站，转乘密63路至云蒙山景区',
    ARRAY['登山', '红叶', '密云', '四季皆宜'],
    '[{"distance":0,"elevation":380},{"distance":2.0,"elevation":520},{"distance":4.0,"elevation":710},{"distance":6.0,"elevation":900},{"distance":8.0,"elevation":1100},{"distance":10.0,"elevation":1300},{"distance":11.5,"elevation":1414},{"distance":13.0,"elevation":1100},{"distance":15.2,"elevation":380}]',
    '[{"latitude":40.5840,"longitude":116.7430,"name":"云海观景台","description":"海拔1200米处观景平台，晴天可远眺密云水库"},{"latitude":40.5850,"longitude":116.7440,"name":"主峰石碑","description":"云蒙山主峰标志，1414米海拔标记"}]'
  );

  -- 3. 海坨山纵走 (expert)
  INSERT INTO routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, tags, elevation_profile, photo_spots)
  VALUES (
    v_route_haituo, v_demo_user,
    '海坨山纵走',
    '海坨山是北京第二高峰，海拔2241米，位于延庆与河北交界处。纵走路线从大海坨到小海坨，途经高山草甸、松林和碎石坡。冬季积雪期长，夏季山花烂漫。需要过夜露营，全程约需两天完成，对体能和户外经验要求很高。',
    28.6, 1780, '2 days', 'expert', 'YDS Class 4',
    4.8, 0,
    40.5572, 115.8447, '北京延庆', 2241,
    false, '自驾至延庆西大庄科村，或包车前往登山口',
    ARRAY['高山', '露营', '纵走', '延庆', '两日线'],
    '[{"distance":0,"elevation":900},{"distance":3.0,"elevation":1200},{"distance":6.0,"elevation":1580},{"distance":9.0,"elevation":1900},{"distance":12.0,"elevation":2150},{"distance":14.5,"elevation":2241},{"distance":17.0,"elevation":2100},{"distance":20.0,"elevation":1800},{"distance":23.0,"elevation":1450},{"distance":26.0,"elevation":1100},{"distance":28.6,"elevation":900}]',
    '[{"latitude":40.5580,"longitude":115.8450,"name":"大海坨峰顶","description":"北京第二高峰，360度全景，天气好时可见官厅水库"},{"latitude":40.5560,"longitude":115.8430,"name":"高山草甸营地","description":"海拔2000米处的平坦草甸，是经典露营点"},{"latitude":40.5550,"longitude":115.8420,"name":"日出观景点","description":"东侧山脊，清晨可观壮丽日出"}]'
  );

  -- 4. 十三陵水库环线 (easy)
  INSERT INTO routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, tags, elevation_profile, photo_spots)
  VALUES (
    v_route_shisanling, v_demo_user,
    '十三陵水库环线',
    '围绕十三陵水库的休闲环湖步道，路面平整，沿途绿树成荫，水库风光秀丽。适合家庭出游和入门级徒步者，沿途设有多处休息亭和饮水点。春季可赏樱花，秋季可观水鸟。',
    8.3, 120, '2 hours 30 minutes', 'easy', NULL,
    4.0, 0,
    40.2586, 116.2283, '北京昌平', 185,
    true, '地铁昌平线至昌平站，换乘昌32路至十三陵水库',
    ARRAY['环湖', '休闲', '家庭', '昌平', '新手友好'],
    '[{"distance":0,"elevation":110},{"distance":1.5,"elevation":130},{"distance":3.0,"elevation":150},{"distance":4.5,"elevation":185},{"distance":6.0,"elevation":140},{"distance":7.5,"elevation":120},{"distance":8.3,"elevation":110}]',
    '[{"latitude":40.2590,"longitude":116.2290,"name":"水库大坝","description":"十三陵水库主坝，可俯瞰整个水库全景"},{"latitude":40.2600,"longitude":116.2300,"name":"樱花步道","description":"春季樱花盛开时的最佳拍照点"}]'
  );

  -- 5. 香山公园主峰 (easy)
  INSERT INTO routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, tags, elevation_profile, photo_spots)
  VALUES (
    v_route_xiangshan, v_demo_user,
    '香山公园主峰',
    '香山是北京最知名的登山目的地之一，主峰香炉峰海拔557米。园内步道成熟，沿途有碧云寺、见心斋等历史景点。秋季红叶节期间漫山红遍，是北京最经典的秋景。路线清晰，适合所有水平的徒步者。',
    6.8, 380, '2 hours', 'easy', NULL,
    3.8, 0,
    39.9908, 116.1887, '北京海淀', 557,
    true, '地铁西郊线至香山站，步行5分钟至公园东门',
    ARRAY['红叶', '公园', '海淀', '历史', '新手友好'],
    '[{"distance":0,"elevation":80},{"distance":1.0,"elevation":150},{"distance":2.0,"elevation":250},{"distance":3.0,"elevation":380},{"distance":4.0,"elevation":480},{"distance":5.0,"elevation":557},{"distance":6.0,"elevation":300},{"distance":6.8,"elevation":80}]',
    '[{"latitude":39.9912,"longitude":116.1890,"name":"香炉峰","description":"香山最高点，可俯瞰北京西部城区"},{"latitude":39.9905,"longitude":116.1880,"name":"红叶观赏区","description":"秋季红叶最密集的区域，10月中下旬最佳"}]'
  );

  -- 6. 灵山穿越 (hard)
  INSERT INTO routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, tags, elevation_profile, photo_spots)
  VALUES (
    v_route_lingshan, v_demo_user,
    '灵山穿越',
    '灵山是北京最高峰，主峰海拔2303米。穿越路线从江水河村出发，经亚高山草甸登顶后下撤至洪水口村。高海拔地带植被以草甸和灌木为主，夏季野花遍地。天气变化剧烈，需携带防风保暖装备。',
    18.5, 1420, '9 hours', 'hard', 'YDS Class 2',
    4.6, 0,
    39.9453, 115.4628, '北京门头沟', 2303,
    false, '自驾至门头沟江水河村，或从苹果园地铁站包车',
    ARRAY['高山', '草甸', '门头沟', '北京之巅', '挑战'],
    '[{"distance":0,"elevation":1100},{"distance":2.5,"elevation":1350},{"distance":5.0,"elevation":1650},{"distance":7.5,"elevation":1950},{"distance":10.0,"elevation":2200},{"distance":11.5,"elevation":2303},{"distance":13.5,"elevation":2050},{"distance":15.5,"elevation":1700},{"distance":18.5,"elevation":1100}]',
    '[{"latitude":39.9458,"longitude":115.4632,"name":"灵山主峰","description":"北京最高点2303米，天晴可见远处山脉连绵"},{"latitude":39.9450,"longitude":115.4625,"name":"亚高山草甸","description":"海拔2000米以上的广阔草甸，7-8月野花盛开"},{"latitude":39.9445,"longitude":115.4618,"name":"松林营地","description":"海拔1800米处的松树林中，适合临时休息"}]'
  );

  -- ==========================================================
  -- Gear categories (10)
  -- ==========================================================
  INSERT INTO gear_categories (id, name, icon, sort_order) VALUES
    (v_cat_boot,     '登山鞋', 'boot',     1),
    (v_cat_backpack, '背包',   'backpack', 2),
    (v_cat_jacket,   '冲锋衣', 'jacket',   3),
    (v_cat_tent,     '帐篷',   'tent',     4),
    (v_cat_bottle,   '水壶',   'bottle',   5),
    (v_cat_battery,  '充电宝', 'battery',  6),
    (v_cat_light,    '头灯',   'light',    7),
    (v_cat_knife,    '刀具',   'knife',    8),
    (v_cat_socks,    '袜子',   'socks',    9),
    (v_cat_shield,   '护具',   'shield',  10);

  -- ==========================================================
  -- Gear items (13)
  -- ==========================================================
  INSERT INTO gear_items (id, user_id, category_id, name, brand, weight_g, price, condition, photo_url, notes, is_favorite, purchased_at) VALUES
    (v_gear1,  v_demo_user, v_cat_boot,     'Speedgoat 5',          'HOKA',       292, 1299, 'good',  'https://example.com/gear/hoka-speedgoat5.jpg',    '缓震出色，适合长距离越野', true,  '2024-03-15T00:00:00Z'),
    (v_gear2,  v_demo_user, v_cat_boot,     'X Ultra 4 GTX',        'Salomon',    385, 1099, 'good',  'https://example.com/gear/salomon-xultra4.jpg',    '防水性能优秀，适合雨季',   false, '2023-11-20T00:00:00Z'),
    (v_gear3,  v_demo_user, v_cat_backpack, 'Osprey Atmos AG 65',   'Osprey',    2100, 2299, 'new',   'https://example.com/gear/osprey-atmos65.jpg',     '大容量，背负系统舒适',     true,  '2024-05-01T00:00:00Z'),
    (v_gear4,  v_demo_user, v_cat_backpack, 'Stratos 36',           'Osprey',    1450, 1199, 'good',  'https://example.com/gear/osprey-stratos36.jpg',   '日常徒步首选',             false, '2023-08-10T00:00:00Z'),
    (v_gear5,  v_demo_user, v_cat_jacket,   'Beta AR Jacket',       'Arc''teryx', 455, 4599, 'new',   'https://example.com/gear/arcteryx-beta-ar.jpg',   'Gore-Tex Pro面料，三季通用', true,  '2024-04-20T00:00:00Z'),
    (v_gear6,  v_demo_user, v_cat_jacket,   'Torrentshell 3L',      'Patagonia',  394, 1299, 'fair',  'https://example.com/gear/patagonia-torrent.jpg',  '轻便防水，日常通勤也可用', false, '2022-09-15T00:00:00Z'),
    (v_gear7,  v_demo_user, v_cat_tent,     'Hubba Hubba NX 2',     'MSR',       1540, 3299, 'good',  'https://example.com/gear/msr-hubba2.jpg',         '双人帐，重量和空间的平衡',  true,  '2024-01-10T00:00:00Z'),
    (v_gear8,  v_demo_user, v_cat_bottle,   'Hydro Flask 32oz',     'Hydro Flask', 390,  329, 'good',  'https://example.com/gear/hydroflask-32.jpg',      '保温效果优秀',             false, '2023-06-01T00:00:00Z'),
    (v_gear9,  v_demo_user, v_cat_battery,  'Anker 737 Power Bank', 'Anker',      500,  599, 'new',   'https://example.com/gear/anker-737.jpg',          '24000mAh大容量，支持快充', false, '2024-07-01T00:00:00Z'),
    (v_gear10, v_demo_user, v_cat_light,    'Actik Core',           'Petzl',       75,  399, 'good',  'https://example.com/gear/petzl-actik.jpg',        '450流明，充电式',          true,  '2024-02-28T00:00:00Z'),
    (v_gear11, v_demo_user, v_cat_knife,    'Spartan',              'Victorinox',  58,  249, 'good',  'https://example.com/gear/victorinox-spartan.jpg', '经典瑞士军刀，日常够用',  false, '2022-12-25T00:00:00Z'),
    (v_gear12, v_demo_user, v_cat_socks,    'Hiker Micro Crew',     'Darn Tough',  85,  199, 'new',   'https://example.com/gear/darntough-hiker.jpg',    '美利奴羊毛，透气排汗',    false, '2024-06-10T00:00:00Z'),
    (v_gear13, v_demo_user, v_cat_shield,   'Trekking Poles',       'Black Diamond', 510, 799, 'good', 'https://example.com/gear/bd-poles.jpg',           'Z-Pole折叠式，下山护膝',  true,  '2023-10-05T00:00:00Z');

  -- ==========================================================
  -- Reviews (2 for 箭扣长城)
  -- ==========================================================
  INSERT INTO reviews (id, route_id, user_id, rating, content, photos) VALUES
    (v_review1, v_route_jiankou, v_demo_user, 5,
     '绝对是北京最值得走的野长城！鹰飞倒仰那段确实需要胆量，建议佩戴手套。春天去的时候山花烂漫，长城上基本没什么人，体验非常棒。注意水要带够，全程没有补水点。',
     ARRAY['https://example.com/reviews/jiankou-1.jpg', 'https://example.com/reviews/jiankou-2.jpg']),
    (v_review2, v_route_jiankou, v_demo_user, 4,
     '第二次去走了不同的段落，从西栅子上到北京结再往正北楼方向。路况比上次走的段落好一些，但依然需要注意安全。秋天的景色比春天更壮观，推荐10月中旬去。',
     ARRAY['https://example.com/reviews/jiankou-3.jpg']);

  -- ==========================================================
  -- Achievements (6)
  -- ==========================================================
  INSERT INTO achievements (id, name, description, icon, condition_type, condition_value) VALUES
    (v_ach1, '初次启程',   '完成第一次徒步行程',               'first_trip',      'trips_count',     '{"min": 1}'),
    (v_ach2, '十公里勇士', '单次行程达到10公里',               'distance_10k',    'single_distance', '{"min_km": 10}'),
    (v_ach3, '登高望远',   '累计爬升超过5000米',               'elevation_5000',  'total_elevation', '{"min_m": 5000}'),
    (v_ach4, '百里行者',   '累计徒步距离超过100公里',          'distance_100k',   'total_distance',  '{"min_km": 100}'),
    (v_ach5, '装备达人',   '拥有超过10件装备',                 'gear_collector',  'gear_count',      '{"min": 10}'),
    (v_ach6, '探路先锋',   '发布第一条路线',                   'first_route',     'routes_count',    '{"min": 1}');

  -- ==========================================================
  -- User achievements (5 for demo user)
  -- ==========================================================
  INSERT INTO user_achievements (id, user_id, achievement_id, earned_at, trip_id) VALUES
    (uuid_generate_v4(), v_demo_user, v_ach1, '2024-07-10T14:30:00Z', NULL),
    (uuid_generate_v4(), v_demo_user, v_ach2, '2024-07-10T14:30:00Z', NULL),
    (uuid_generate_v4(), v_demo_user, v_ach3, '2024-10-15T16:00:00Z', NULL),
    (uuid_generate_v4(), v_demo_user, v_ach4, '2024-11-20T12:00:00Z', NULL),
    (uuid_generate_v4(), v_demo_user, v_ach5, '2024-07-01T10:00:00Z', NULL);

  -- ==========================================================
  -- Trips (3 completed for demo user)
  -- ==========================================================
  INSERT INTO trips (id, user_id, route_id, started_at, finished_at, actual_distance_km, actual_elevation_m, actual_duration, avg_speed_kmh, max_altitude_m, calories_burned, steps, photos, gear_used, weather_summary, status, rating, notes) VALUES
    (v_trip1, v_demo_user, v_route_jiankou,
     '2024-09-28T06:30:00Z', '2024-09-28T13:45:00Z',
     13.1, 890, '7 hours 15 minutes', 1.8, 1044, 2850, 28500,
     ARRAY['https://example.com/trips/trip1-1.jpg', 'https://example.com/trips/trip1-2.jpg'],
     ARRAY[v_gear1, v_gear4, v_gear5, v_gear8, v_gear10]::uuid[],
     '{"condition": "晴", "temp_high": 22, "temp_low": 12, "wind": "东北风3级"}',
     'completed', 5,
     '秋高气爽，能见度极好。鹰飞倒仰段略有挑战但很过瘾，全程约7小时。'),

    (v_trip2, v_demo_user, v_route_xiangshan,
     '2024-10-20T08:00:00Z', '2024-10-20T10:30:00Z',
     7.2, 395, '2 hours 30 minutes', 2.9, 557, 980, 12800,
     ARRAY['https://example.com/trips/trip2-1.jpg'],
     ARRAY[v_gear2, v_gear8]::uuid[],
     '{"condition": "多云", "temp_high": 18, "temp_low": 10, "wind": "北风2级"}',
     'completed', 4,
     '红叶季人比较多，但景色确实漂亮。建议早上7点前到达避开人流。'),

    (v_trip3, v_demo_user, v_route_yunmeng,
     '2024-11-09T07:00:00Z', '2024-11-09T14:20:00Z',
     15.8, 1080, '7 hours 20 minutes', 2.2, 1414, 3200, 32100,
     ARRAY['https://example.com/trips/trip3-1.jpg', 'https://example.com/trips/trip3-2.jpg', 'https://example.com/trips/trip3-3.jpg'],
     ARRAY[v_gear1, v_gear3, v_gear5, v_gear8, v_gear9, v_gear10, v_gear13]::uuid[],
     '{"condition": "晴转多云", "temp_high": 8, "temp_low": -2, "wind": "西北风4级"}',
     'completed', 5,
     '初冬的云蒙山别有风味，山顶有薄雪。风很大，冲锋衣和登山杖必备。');

  -- ==========================================================
  -- Notifications (5)
  -- ==========================================================
  INSERT INTO notifications (id, user_id, type, title, body, data, is_read) VALUES
    (uuid_generate_v4(), v_demo_user, 'weather',
     '周末天气提醒',
     '本周六北京山区预计有小到中雨，建议调整户外计划或携带雨具。',
     '{"forecast": "rain", "date": "2024-12-07", "region": "北京山区"}',
     false),

    (uuid_generate_v4(), v_demo_user, 'achievement',
     '解锁新成就：百里行者',
     '恭喜！你的累计徒步距离已超过100公里，继续加油！',
     '{"achievement_id": "d0000000-0000-0000-0000-000000000004"}',
     true),

    (uuid_generate_v4(), v_demo_user, 'social',
     '新的关注者',
     '用户"北京驴友小王"开始关注你了。',
     '{"follower_id": "00000000-0000-0000-0000-000000000099"}',
     false),

    (uuid_generate_v4(), v_demo_user, 'system',
     'Kaipa 2.0 版本更新',
     '新版本已上线！新增GPX导入功能和离线地图下载，快来体验吧。',
     '{"version": "2.0.0", "url": "https://kaipa.app/update"}',
     true),

    (uuid_generate_v4(), v_demo_user, 'safety',
     '灵山地区安全警告',
     '近期灵山地区气温骤降，部分路段结冰，请携带冰爪等防滑装备，注意安全。',
     '{"route_id": "a0000000-0000-0000-0000-000000000006", "severity": "warning"}',
     false);

  -- ==========================================================
  -- Feed items (2)
  -- ==========================================================
  INSERT INTO feed_items (id, user_id, type, content, route_id, trip_id) VALUES
    (uuid_generate_v4(), v_demo_user, 'trip_completed',
     '{"summary": "完成了云蒙山主峰徒步，全程15.8公里，爬升1080米", "photo": "https://example.com/trips/trip3-1.jpg", "duration": "7小时20分钟"}',
     v_route_yunmeng, v_trip3),

    (uuid_generate_v4(), v_demo_user, 'achievement_earned',
     '{"achievement_name": "百里行者", "achievement_icon": "distance_100k", "description": "累计徒步距离超过100公里"}',
     NULL, NULL);

END $$;
