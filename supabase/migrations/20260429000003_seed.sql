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
  v_gear14 uuid := 'c0000000-0000-0000-0000-000000000014';
  v_gear15 uuid := 'c0000000-0000-0000-0000-000000000015';
  v_gear16 uuid := 'c0000000-0000-0000-0000-000000000016';
  v_gear17 uuid := 'c0000000-0000-0000-0000-000000000017';
  v_gear18 uuid := 'c0000000-0000-0000-0000-000000000018';
  v_gear19 uuid := 'c0000000-0000-0000-0000-000000000019';
  v_gear20 uuid := 'c0000000-0000-0000-0000-000000000020';
  v_gear21 uuid := 'c0000000-0000-0000-0000-000000000021';
  v_gear22 uuid := 'c0000000-0000-0000-0000-000000000022';
  v_gear23 uuid := 'c0000000-0000-0000-0000-000000000023';
  v_gear24 uuid := 'c0000000-0000-0000-0000-000000000024';
  v_gear25 uuid := 'c0000000-0000-0000-0000-000000000025';
  v_gear26 uuid := 'c0000000-0000-0000-0000-000000000026';
  v_gear27 uuid := 'c0000000-0000-0000-0000-000000000027';
  v_gear28 uuid := 'c0000000-0000-0000-0000-000000000028';
  v_gear29 uuid := 'c0000000-0000-0000-0000-000000000029';
  v_gear30 uuid := 'c0000000-0000-0000-0000-000000000030';
  v_gear31 uuid := 'c0000000-0000-0000-0000-000000000031';
  v_gear32 uuid := 'c0000000-0000-0000-0000-000000000032';
  v_gear33 uuid := 'c0000000-0000-0000-0000-000000000033';
  v_gear34 uuid := 'c0000000-0000-0000-0000-000000000034';
  v_gear35 uuid := 'c0000000-0000-0000-0000-000000000035';
  v_gear36 uuid := 'c0000000-0000-0000-0000-000000000036';
  v_gear37 uuid := 'c0000000-0000-0000-0000-000000000037';
  v_gear38 uuid := 'c0000000-0000-0000-0000-000000000038';
  v_gear39 uuid := 'c0000000-0000-0000-0000-000000000039';

  -- Achievement UUIDs
  v_ach1 uuid := 'd0000000-0000-0000-0000-000000000001';
  v_ach2 uuid := 'd0000000-0000-0000-0000-000000000002';
  v_ach3 uuid := 'd0000000-0000-0000-0000-000000000003';
  v_ach4 uuid := 'd0000000-0000-0000-0000-000000000004';
  v_ach5 uuid := 'd0000000-0000-0000-0000-000000000005';
  v_ach6 uuid := 'd0000000-0000-0000-0000-000000000006';

  -- Trip UUIDs
  v_trip1  uuid := 'e0000000-0000-0000-0000-000000000001';
  v_trip2  uuid := 'e0000000-0000-0000-0000-000000000002';
  v_trip3  uuid := 'e0000000-0000-0000-0000-000000000003';
  v_trip4  uuid := 'e0000000-0000-0000-0000-000000000004';
  v_trip5  uuid := 'e0000000-0000-0000-0000-000000000005';
  v_trip6  uuid := 'e0000000-0000-0000-0000-000000000006';
  v_trip7  uuid := 'e0000000-0000-0000-0000-000000000007';
  v_trip8  uuid := 'e0000000-0000-0000-0000-000000000008';
  v_trip9  uuid := 'e0000000-0000-0000-0000-000000000009';
  v_trip10 uuid := 'e0000000-0000-0000-0000-000000000010';
  v_trip11 uuid := 'e0000000-0000-0000-0000-000000000011';
  v_trip12 uuid := 'e0000000-0000-0000-0000-000000000012';

  -- Review UUIDs
  v_review1 uuid := 'f0000000-0000-0000-0000-000000000001';
  v_review2 uuid := 'f0000000-0000-0000-0000-000000000002';
  v_review3 uuid := 'f0000000-0000-0000-0000-000000000003';
  v_review4 uuid := 'f0000000-0000-0000-0000-000000000004';

  -- Preset UUIDs
  v_preset1 uuid := 'f1000000-0000-0000-0000-000000000001';
  v_preset2 uuid := 'f1000000-0000-0000-0000-000000000002';
  v_preset3 uuid := 'f1000000-0000-0000-0000-000000000003';

BEGIN

  -- ==========================================================
  -- Create demo user in auth.users (required for profiles FK)
  -- ==========================================================
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
  VALUES (
    v_demo_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo@kaipa.app',
    extensions.crypt('demo123456', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"山野探索者"}',
    false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_demo_user,
    jsonb_build_object('sub', v_demo_user::text, 'email', 'demo@kaipa.app'),
    'email',
    v_demo_user::text,
    now(),
    now(),
    now()
  ) ON CONFLICT DO NOTHING;

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
    153.2,
    9528,
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
    4.8, 1,
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
    4.6, 1,
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
  -- Gear items (39)
  -- ==========================================================
  INSERT INTO gear_items (id, user_id, category_id, name, brand, weight_g, price, condition, photo_url, notes, is_favorite, purchased_at) VALUES
    -- ── 登山鞋 (5) ──────────────────────────────────────────
    (v_gear1,  v_demo_user, v_cat_boot,     'Speedgoat 5',          'HOKA',          292, 1299, 'good',  'https://example.com/gear/hoka-speedgoat5.jpg',       '缓震出色，适合长距离越野',               true,  '2024-03-15T00:00:00Z'),
    (v_gear2,  v_demo_user, v_cat_boot,     'X Ultra 4 GTX',        'Salomon',       385, 1099, 'good',  'https://example.com/gear/salomon-xultra4.jpg',       '防水性能优秀，适合雨季',                 false, '2023-11-20T00:00:00Z'),
    (v_gear14, v_demo_user, v_cat_boot,     'TX4 Mid GTX',          'La Sportiva',   635, 1699, 'good',  'https://example.com/gear/lasportiva-tx4mid.jpg',     '攀爬性能强，箭扣鹰飞倒仰穿这双',         true,  '2024-01-08T00:00:00Z'),
    (v_gear15, v_demo_user, v_cat_boot,     'Zodiac Plus GTX',      'Scarpa',        760, 2899, 'new',   'https://example.com/gear/scarpa-zodiac.jpg',         '重装徒步靴，海坨山纵走首选',             false, '2025-03-20T00:00:00Z'),
    (v_gear16, v_demo_user, v_cat_boot,     'FUGA EX 2',            '凯乐石',        260,  799, 'fair',  'https://example.com/gear/kailas-fugaex2.jpg',        '越野跑鞋，轻量但鞋底磨得差不多了',       false, '2023-05-01T00:00:00Z'),

    -- ── 背包 (5) ────────────────────────────────────────────
    (v_gear3,  v_demo_user, v_cat_backpack, 'Atmos AG 65',          'Osprey',       2100, 2299, 'new',   'https://example.com/gear/osprey-atmos65.jpg',        '大容量，背负系统舒适',                   true,  '2024-05-01T00:00:00Z'),
    (v_gear4,  v_demo_user, v_cat_backpack, 'Stratos 36',           'Osprey',       1450, 1199, 'good',  'https://example.com/gear/osprey-stratos36.jpg',      '日常徒步首选',                           false, '2023-08-10T00:00:00Z'),
    (v_gear17, v_demo_user, v_cat_backpack, 'Baltoro 75',           'Gregory',      2360, 2899, 'fair',  'https://example.com/gear/gregory-baltoro75.jpg',     '海坨山两日线用过，腰带有点磨损',         false, '2022-10-15T00:00:00Z'),
    (v_gear18, v_demo_user, v_cat_backpack, 'Speed Lite 20',        'Deuter',        450,  599, 'good',  'https://example.com/gear/deuter-speedlite20.jpg',    '轻量日用包，香山十三陵这种线路够用',     false, '2024-04-10T00:00:00Z'),
    (v_gear19, v_demo_user, v_cat_backpack, 'FUGA PRO 越野跑背心',  '凯乐石',        280,  699, 'new',   'https://example.com/gear/kailas-fugapro-vest.jpg',   '贴身设计不晃，带两个软水壶',             false, '2025-02-28T00:00:00Z'),

    -- ── 冲锋衣 (5) ──────────────────────────────────────────
    (v_gear5,  v_demo_user, v_cat_jacket,   'Beta AR Jacket',       'Arc''teryx',    455, 4599, 'new',   'https://example.com/gear/arcteryx-beta-ar.jpg',      'Gore-Tex Pro面料，三季通用',              true,  '2024-04-20T00:00:00Z'),
    (v_gear6,  v_demo_user, v_cat_jacket,   'Torrentshell 3L',      'Patagonia',     394, 1299, 'fair',  'https://example.com/gear/patagonia-torrent.jpg',     '轻便防水，日常通勤也可用',               false, '2022-09-15T00:00:00Z'),
    (v_gear20, v_demo_user, v_cat_jacket,   'ThermoBall Eco Hoodie', 'The North Face', 380, 1799, 'good', 'https://example.com/gear/tnf-thermoball.jpg',        '潮湿环境也保暖，秋冬中间层',             false, '2024-09-05T00:00:00Z'),
    (v_gear21, v_demo_user, v_cat_jacket,   'Mont X 轻量羽绒服',     '凯乐石',        320, 1299, 'new',   'https://example.com/gear/kailas-montx-down.jpg',     '800蓬鹅绒，压缩后拳头大小',              true,  '2025-01-15T00:00:00Z'),
    (v_gear22, v_demo_user, v_cat_jacket,   'Kento HS Hooded',      'Mammut',        480, 3499, 'good',  'https://example.com/gear/mammut-kento.jpg',          '硬壳，灵山大风天穿这件',                 false, '2024-06-20T00:00:00Z'),

    -- ── 帐篷 (3) ────────────────────────────────────────────
    (v_gear7,  v_demo_user, v_cat_tent,     'Hubba Hubba NX 2',     'MSR',          1540, 3299, 'good',  'https://example.com/gear/msr-hubba2.jpg',            '双人帐，重量和空间的平衡',                true,  '2024-01-10T00:00:00Z'),
    (v_gear23, v_demo_user, v_cat_tent,     'Cloud Up 2 升级版',     'Naturehike',   1280,  569, 'good',  'https://example.com/gear/nh-cloudup2.jpg',            '性价比之王，带朋友入门就用这顶',          false, '2023-04-20T00:00:00Z'),
    (v_gear24, v_demo_user, v_cat_tent,     'Anjan 2 GT',           'Hilleberg',    1900, 7999, 'new',   'https://example.com/gear/hilleberg-anjan2.jpg',      '四季帐，冬季海坨山扎营抗风暴级别',        false, '2025-11-01T00:00:00Z'),

    -- ── 水壶 (4) ────────────────────────────────────────────
    (v_gear8,  v_demo_user, v_cat_bottle,   'Wide Mouth 32oz',      'Hydro Flask',   390,  329, 'good',  'https://example.com/gear/hydroflask-32.jpg',         '保温效果优秀',                           false, '2023-06-01T00:00:00Z'),
    (v_gear25, v_demo_user, v_cat_bottle,   'Tritan Wide Mouth 1L', 'Nalgene',       180,   99, 'good',  'https://example.com/gear/nalgene-1l.jpg',            '耐摔，刻度方便看水量',                   false, '2022-03-10T00:00:00Z'),
    (v_gear26, v_demo_user, v_cat_bottle,   'Vecto 3L 水袋',        'CNOC',          170,  179, 'new',   'https://example.com/gear/cnoc-vecto3l.jpg',          '可折叠，配Sawyer滤水器用',               false, '2025-04-01T00:00:00Z'),
    (v_gear27, v_demo_user, v_cat_bottle,   'FJM-500 真空保温杯',    '膳魔师',        300,  269, 'worn',  'https://example.com/gear/thermos-fjm500.jpg',        '冬天山顶喝口热水续命，杯盖有点松了',      false, '2021-12-20T00:00:00Z'),

    -- ── 充电宝 (3) ──────────────────────────────────────────
    (v_gear9,  v_demo_user, v_cat_battery,  'Anker 737 Power Bank', 'Anker',         500,  599, 'new',   'https://example.com/gear/anker-737.jpg',             '24000mAh大容量，支持快充',               false, '2024-07-01T00:00:00Z'),
    (v_gear28, v_demo_user, v_cat_battery,  'NB10000',              'Nitecore',      150,  299, 'new',   'https://example.com/gear/nitecore-nb10000.jpg',      '超轻碳纤外壳，日线够用',                 true,  '2025-03-15T00:00:00Z'),
    (v_gear29, v_demo_user, v_cat_battery,  '移动电源 3 20000mAh',   '小米',          405,  149, 'good',  'https://example.com/gear/xiaomi-20000.jpg',          '两日线备用，便宜耐造',                   false, '2023-11-11T00:00:00Z'),

    -- ── 头灯 (3) ────────────────────────────────────────────
    (v_gear10, v_demo_user, v_cat_light,    'Actik Core',           'Petzl',          75,  399, 'good',  'https://example.com/gear/petzl-actik.jpg',           '450流明，充电式',                        true,  '2024-02-28T00:00:00Z'),
    (v_gear30, v_demo_user, v_cat_light,    'Storm 500-R',          'Black Diamond', 120,  549, 'good',  'https://example.com/gear/bd-storm500r.jpg',          '500流明防水，大雨里用过没问题',           false, '2024-08-10T00:00:00Z'),
    (v_gear31, v_demo_user, v_cat_light,    'NU25 UL',              'Nitecore',       28,  239, 'new',   'https://example.com/gear/nitecore-nu25ul.jpg',       '28克超轻，越野跑戴着不晃',               false, '2025-05-20T00:00:00Z'),

    -- ── 刀具 (3) ────────────────────────────────────────────
    (v_gear11, v_demo_user, v_cat_knife,    'Spartan',              'Victorinox',     58,  249, 'good',  'https://example.com/gear/victorinox-spartan.jpg',    '经典瑞士军刀，日常够用',                 false, '2022-12-25T00:00:00Z'),
    (v_gear32, v_demo_user, v_cat_knife,    'Companion Heavy Duty', 'Morakniv',      116,  149, 'good',  'https://example.com/gear/morakniv-companion.jpg',    '碳钢刀刃，劈柴削棍都好使',               false, '2023-07-14T00:00:00Z'),
    (v_gear33, v_demo_user, v_cat_knife,    'Signal',               'Leatherman',    213, 1099, 'new',   'https://example.com/gear/leatherman-signal.jpg',     '户外款多功能钳，带打火石和求生哨',        true,  '2025-06-18T00:00:00Z'),

    -- ── 袜子 (4) ────────────────────────────────────────────
    (v_gear12, v_demo_user, v_cat_socks,    'Hiker Micro Crew',     'Darn Tough',     85,  199, 'new',   'https://example.com/gear/darntough-hiker.jpg',       '美利奴羊毛，透气排汗',                   false, '2024-06-10T00:00:00Z'),
    (v_gear34, v_demo_user, v_cat_socks,    'PhD Outdoor Medium Crew', 'Smartwool',   78,  179, 'good',  'https://example.com/gear/smartwool-phd.jpg',         '穿了两年还没破，冬天保暖首选',           true,  '2023-01-05T00:00:00Z'),
    (v_gear35, v_demo_user, v_cat_socks,    'Hike+ Medium Crew',    'Icebreaker',     82,  219, 'new',   'https://example.com/gear/icebreaker-hike.jpg',       '新西兰美利奴，脚感比Smartwool软',        false, '2025-04-22T00:00:00Z'),
    (v_gear36, v_demo_user, v_cat_socks,    '速干徒步袜 3双装',      '凯乐石',         65,   99, 'fair',  'https://example.com/gear/kailas-socks-3pack.jpg',    '性价比高，夏天日线穿',                   false, '2023-06-18T00:00:00Z'),

    -- ── 护具 (4) ────────────────────────────────────────────
    (v_gear13, v_demo_user, v_cat_shield,   'Distance Carbon Z',    'Black Diamond', 510,  799, 'good',  'https://example.com/gear/bd-poles.jpg',              'Z-Pole折叠式，下山护膝',                 true,  '2023-10-05T00:00:00Z'),
    (v_gear37, v_demo_user, v_cat_shield,   'Half Dome 攀岩头盔',    'Black Diamond', 350,  549, 'good',  'https://example.com/gear/bd-halfdome.jpg',           '箭扣落石区必戴，调节系统舒服',           false, '2024-03-01T00:00:00Z'),
    (v_gear38, v_demo_user, v_cat_shield,   'MH500 登山护膝',        '迪卡侬',        240,  149, 'worn',  'https://example.com/gear/decathlon-kneebrace.jpg',   '下山长陡坡绑上，弹簧片有点变形了',       false, '2022-08-20T00:00:00Z'),
    (v_gear39, v_demo_user, v_cat_shield,   'Stalker 通用冰爪',      'Camp',          920,  899, 'new',   'https://example.com/gear/camp-stalker.jpg',          '12齿全卡式，冬季灵山海坨必备',           false, '2025-12-01T00:00:00Z');

  -- ==========================================================
  -- Reviews (2 for 箭扣长城)
  -- ==========================================================
  INSERT INTO reviews (id, route_id, user_id, rating, content, photos) VALUES
    (v_review1, v_route_jiankou, v_demo_user, 5,
     '绝对是北京最值得走的野长城！鹰飞倒仰那段确实需要胆量，建议佩戴手套。春天去的时候山花烂漫，长城上基本没什么人，体验非常棒。注意水要带够，全程没有补水点。',
     ARRAY['https://example.com/reviews/jiankou-1.jpg', 'https://example.com/reviews/jiankou-2.jpg']),
    (v_review2, v_route_jiankou, v_demo_user, 4,
     '第二次去走了不同的段落，从西栅子上到北京结再往正北楼方向。路况比上次走的段落好一些，但依然需要注意安全。秋天的景色比春天更壮观，推荐10月中旬去。',
     ARRAY['https://example.com/reviews/jiankou-3.jpg']),

    (v_review3, v_route_lingshan, v_demo_user, 5,
     '灵山不愧是北京之巅，穿越路线虽然辛苦但非常值得。亚高山草甸在四五月份开满野花，和阿尔卑斯的感觉很像。山顶风非常大，硬壳冲锋衣是必备的。建议带登山杖减轻膝盖压力。',
     ARRAY['https://example.com/reviews/lingshan-1.jpg', 'https://example.com/reviews/lingshan-2.jpg']),

    (v_review4, v_route_haituo, v_demo_user, 5,
     '海坨山纵走是北京周边最有野趣的两日线路。大海坨峰顶的360度全景震撼人心，草甸营地扎营看星空是难忘的体验。需要充足的体能和负重能力，建议有几次日线经验后再挑战。注意第二天下山路段碎石多，护踝的重装靴很重要。',
     ARRAY['https://example.com/reviews/haituo-1.jpg', 'https://example.com/reviews/haituo-2.jpg']);

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
    (gen_random_uuid(), v_demo_user, v_ach1, '2024-07-10T14:30:00Z', NULL),
    (gen_random_uuid(), v_demo_user, v_ach2, '2024-07-10T14:30:00Z', NULL),
    (gen_random_uuid(), v_demo_user, v_ach3, '2024-10-15T16:00:00Z', NULL),
    (gen_random_uuid(), v_demo_user, v_ach4, '2024-11-20T12:00:00Z', NULL),
    (gen_random_uuid(), v_demo_user, v_ach5, '2024-07-01T10:00:00Z', NULL);

  -- ==========================================================
  -- Trips (3 completed for demo user)
  -- ==========================================================
  INSERT INTO trips (id, user_id, route_id, started_at, finished_at, actual_distance_km, actual_elevation_m, actual_duration, avg_speed_kmh, max_altitude_m, calories_burned, steps, photos, gear_used, weather_summary, status, rating, notes) VALUES
    (v_trip1, v_demo_user, v_route_jiankou,
     '2024-09-28T06:30:00Z', '2024-09-28T13:45:00Z',
     13.1, 890, '7 hours 15 minutes', 1.8, 1044, 2850, 28500,
     ARRAY['https://example.com/trips/trip1-1.jpg', 'https://example.com/trips/trip1-2.jpg'],
     ARRAY[v_gear1, v_gear4, v_gear5, v_gear8, v_gear10, v_gear37]::uuid[],
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
     ARRAY[v_gear1, v_gear3, v_gear5, v_gear8, v_gear9, v_gear10, v_gear13, v_gear34]::uuid[],
     '{"condition": "晴转多云", "temp_high": 8, "temp_low": -2, "wind": "西北风4级"}',
     'completed', 5,
     '初冬的云蒙山别有风味，山顶有薄雪。风很大，冲锋衣和登山杖必备。'),

    -- Trip 4: 第一次徒步 — 十三陵水库
    (v_trip4, v_demo_user, v_route_shisanling,
     '2024-07-14T06:30:00Z', '2024-07-14T09:10:00Z',
     8.5, 125, '2 hours 40 minutes', 3.2, 185, 650, 13500,
     ARRAY['https://example.com/trips/trip4-1.jpg'],
     ARRAY[v_gear16, v_gear25]::uuid[],
     '{"condition": "晴", "temp_high": 32, "temp_low": 22, "wind": "南风2级"}',
     'completed', 4,
     '第一次认真徒步！环湖步道风景不错，就是夏天太热了，以后要早点出发。'),

    -- Trip 5: 香山晨练
    (v_trip5, v_demo_user, v_route_xiangshan,
     '2024-08-17T06:00:00Z', '2024-08-17T08:10:00Z',
     6.5, 370, '2 hours 10 minutes', 3.0, 557, 780, 11200,
     ARRAY[]::text[],
     ARRAY[v_gear16, v_gear18, v_gear25]::uuid[],
     '{"condition": "多云", "temp_high": 28, "temp_low": 21, "wind": "东风2级"}',
     'completed', 3,
     '夏天的香山人不多但是闷热，汗如雨下。不过登顶后有风很舒服。'),

    -- Trip 6: 箭扣长城 春季第二次
    (v_trip6, v_demo_user, v_route_jiankou,
     '2025-03-15T06:00:00Z', '2025-03-15T12:30:00Z',
     11.5, 830, '6 hours 30 minutes', 1.8, 1020, 2600, 24800,
     ARRAY['https://example.com/trips/trip6-1.jpg', 'https://example.com/trips/trip6-2.jpg'],
     ARRAY[v_gear14, v_gear4, v_gear5, v_gear8, v_gear10, v_gear37]::uuid[],
     '{"condition": "晴", "temp_high": 15, "temp_low": 3, "wind": "北风3级"}',
     'completed', 5,
     '春天的箭扣比秋天更清静，山桃花开得漫山遍野。这次走了北京结到正北楼段，比上次轻松一些。'),

    -- Trip 7: 灵山穿越 首次
    (v_trip7, v_demo_user, v_route_lingshan,
     '2025-04-26T05:30:00Z', '2025-04-26T14:15:00Z',
     17.8, 1380, '8 hours 45 minutes', 2.0, 2280, 3800, 36200,
     ARRAY['https://example.com/trips/trip7-1.jpg', 'https://example.com/trips/trip7-2.jpg', 'https://example.com/trips/trip7-3.jpg'],
     ARRAY[v_gear15, v_gear3, v_gear5, v_gear22, v_gear8, v_gear9, v_gear10, v_gear13, v_gear34]::uuid[],
     '{"condition": "晴转多云", "temp_high": 12, "temp_low": -1, "wind": "西北风5级"}',
     'completed', 5,
     '北京之巅！最后冲顶那段风大到站不稳，硬壳救命。亚高山草甸太美了，值得每一步的爬升。'),

    -- Trip 8: 海坨山纵走 两日线
    (v_trip8, v_demo_user, v_route_haituo,
     '2025-06-07T05:00:00Z', '2025-06-08T15:30:00Z',
     27.5, 1750, '14 hours', 2.0, 2241, 5200, 52800,
     ARRAY['https://example.com/trips/trip8-1.jpg', 'https://example.com/trips/trip8-2.jpg', 'https://example.com/trips/trip8-3.jpg', 'https://example.com/trips/trip8-4.jpg'],
     ARRAY[v_gear15, v_gear3, v_gear7, v_gear5, v_gear8, v_gear26, v_gear9, v_gear10, v_gear13, v_gear12, v_gear33]::uuid[],
     '{"condition": "晴转阵雨", "temp_high": 18, "temp_low": 5, "wind": "南风3级"}',
     'completed', 5,
     '人生第一次背帐篷过夜！草甸营地的星空太震撼了。第二天下山遇到阵雨，帐篷和冲锋衣都经受住了考验。'),

    -- Trip 9: 十三陵环湖 带同事
    (v_trip9, v_demo_user, v_route_shisanling,
     '2025-08-23T06:00:00Z', '2025-08-23T08:15:00Z',
     8.1, 118, '2 hours 15 minutes', 3.6, 180, 620, 13000,
     ARRAY['https://example.com/trips/trip9-1.jpg'],
     ARRAY[v_gear16, v_gear18, v_gear25]::uuid[],
     '{"condition": "晴", "temp_high": 30, "temp_low": 22, "wind": "南风2级"}',
     'completed', 4,
     '带同事来走入门路线，轻松愉快。水库边风景很好，适合休闲散步。'),

    -- Trip 10: 云蒙山秋色
    (v_trip10, v_demo_user, v_route_yunmeng,
     '2025-10-12T06:30:00Z', '2025-10-12T13:20:00Z',
     14.5, 1020, '6 hours 50 minutes', 2.1, 1414, 3000, 30500,
     ARRAY['https://example.com/trips/trip10-1.jpg', 'https://example.com/trips/trip10-2.jpg'],
     ARRAY[v_gear1, v_gear4, v_gear20, v_gear8, v_gear10, v_gear13, v_gear34]::uuid[],
     '{"condition": "晴", "temp_high": 14, "temp_low": 2, "wind": "西风3级"}',
     'completed', 5,
     '秋天的云蒙山层林尽染，红黄绿三色交织。主峰风大但视野开阔，远眺密云水库波光粼粼。'),

    -- Trip 11: 灵山初冬 (中途下撤)
    (v_trip11, v_demo_user, v_route_lingshan,
     '2025-11-22T06:00:00Z', '2025-11-22T11:20:00Z',
     10.5, 720, '5 hours 20 minutes', 2.0, 1850, 2200, 21000,
     ARRAY['https://example.com/trips/trip11-1.jpg'],
     ARRAY[v_gear15, v_gear3, v_gear22, v_gear21, v_gear8, v_gear27, v_gear10, v_gear30, v_gear13, v_gear39, v_gear34]::uuid[],
     '{"condition": "阴", "temp_high": 2, "temp_low": -8, "wind": "北风6级"}',
     'completed', 3,
     '海拔1850米处遇到结冰路段加大风，虽然带了冰爪但能见度太低，安全起见下撤。冬季灵山不是闹着玩的。'),

    -- Trip 12: 箭扣再访 2026春
    (v_trip12, v_demo_user, v_route_jiankou,
     '2026-03-08T06:30:00Z', '2026-03-08T12:30:00Z',
     12.2, 850, '6 hours', 2.0, 1030, 2700, 26500,
     ARRAY['https://example.com/trips/trip12-1.jpg', 'https://example.com/trips/trip12-2.jpg'],
     ARRAY[v_gear14, v_gear4, v_gear5, v_gear8, v_gear10, v_gear37, v_gear13]::uuid[],
     '{"condition": "晴", "temp_high": 14, "temp_low": 5, "wind": "东北风2级"}',
     'completed', 5,
     '第三次来箭扣了，每次都有新发现。这次从涧口进，走了一段以前没走过的残墙，野趣十足。');

  -- ==========================================================
  -- Notifications (5)
  -- ==========================================================
  INSERT INTO notifications (id, user_id, type, title, body, data, is_read) VALUES
    (gen_random_uuid(), v_demo_user, 'weather',
     '周末天气提醒',
     '本周六北京山区预计有小到中雨，建议调整户外计划或携带雨具。',
     '{"forecast": "rain", "date": "2024-12-07", "region": "北京山区"}',
     false),

    (gen_random_uuid(), v_demo_user, 'achievement',
     '解锁新成就：百里行者',
     '恭喜！你的累计徒步距离已超过100公里，继续加油！',
     '{"achievement_id": "d0000000-0000-0000-0000-000000000004"}',
     true),

    (gen_random_uuid(), v_demo_user, 'social',
     '新的关注者',
     '用户"北京驴友小王"开始关注你了。',
     '{"follower_id": "00000000-0000-0000-0000-000000000099"}',
     false),

    (gen_random_uuid(), v_demo_user, 'system',
     'Kaipa 2.0 版本更新',
     '新版本已上线！新增GPX导入功能和离线地图下载，快来体验吧。',
     '{"version": "2.0.0", "url": "https://kaipa.app/update"}',
     true),

    (gen_random_uuid(), v_demo_user, 'safety',
     '灵山地区安全警告',
     '近期灵山地区气温骤降，部分路段结冰，请携带冰爪等防滑装备，注意安全。',
     '{"route_id": "a0000000-0000-0000-0000-000000000006", "severity": "warning"}',
     false);

  -- ==========================================================
  -- Feed items (2)
  -- ==========================================================
  INSERT INTO feed_items (id, user_id, type, content, route_id, trip_id) VALUES
    (gen_random_uuid(), v_demo_user, 'trip_completed',
     '{"summary": "完成了云蒙山主峰徒步，全程15.8公里，爬升1080米", "photo": "https://example.com/trips/trip3-1.jpg", "duration": "7小时20分钟"}',
     v_route_yunmeng, v_trip3),

    (gen_random_uuid(), v_demo_user, 'achievement_earned',
     '{"achievement_name": "百里行者", "achievement_icon": "distance_100k", "description": "累计徒步距离超过100公里"}',
     NULL, NULL),

    (gen_random_uuid(), v_demo_user, 'trip_completed',
     '{"summary": "完成海坨山两日纵走，全程27.5公里，累计爬升1750米", "photo": "https://example.com/trips/trip8-1.jpg", "duration": "14小时（两日）"}',
     v_route_haituo, v_trip8),

    (gen_random_uuid(), v_demo_user, 'trip_completed',
     '{"summary": "灵山穿越登顶北京之巅2303米，全程17.8公里", "photo": "https://example.com/trips/trip7-1.jpg", "duration": "8小时45分钟"}',
     v_route_lingshan, v_trip7),

    (gen_random_uuid(), v_demo_user, 'trip_completed',
     '{"summary": "箭扣长城春季探访，山桃花开满山", "photo": "https://example.com/trips/trip12-1.jpg", "duration": "6小时"}',
     v_route_jiankou, v_trip12);

  -- ==========================================================
  -- Gear presets (3)
  -- ==========================================================
  INSERT INTO gear_presets (id, user_id, name, created_at) VALUES
    (v_preset1, v_demo_user, '一日徒步',   '2025-04-01T10:00:00Z'),
    (v_preset2, v_demo_user, '过夜重装',   '2025-04-15T10:00:00Z'),
    (v_preset3, v_demo_user, '雪线攀登',   '2025-11-01T10:00:00Z');

  -- Preset 1: 一日徒步 (8 items, ~5.2kg)
  -- Speedgoat 5, Stratos 36, Torrentshell, Nalgene 1L, Nitecore NB10000, Actik Core, 瑞士军刀, 凯乐石速干袜
  INSERT INTO gear_preset_items (preset_id, item_id) VALUES
    (v_preset1, v_gear1),
    (v_preset1, v_gear4),
    (v_preset1, v_gear6),
    (v_preset1, v_gear25),
    (v_preset1, v_gear28),
    (v_preset1, v_gear10),
    (v_preset1, v_gear11),
    (v_preset1, v_gear36);

  -- Preset 2: 过夜重装 (14 items, ~12.1kg)
  -- Zodiac Plus, Atmos AG 65, Beta AR, ThermoBall, MSR帐篷, Hydro Flask, CNOC水袋, Anker充电宝,
  -- Storm 500-R, Leatherman Signal, Darn Tough袜, Distance Carbon Z, Smartwool袜, 小米充电宝
  INSERT INTO gear_preset_items (preset_id, item_id) VALUES
    (v_preset2, v_gear15),
    (v_preset2, v_gear3),
    (v_preset2, v_gear5),
    (v_preset2, v_gear20),
    (v_preset2, v_gear7),
    (v_preset2, v_gear8),
    (v_preset2, v_gear26),
    (v_preset2, v_gear9),
    (v_preset2, v_gear30),
    (v_preset2, v_gear33),
    (v_preset2, v_gear12),
    (v_preset2, v_gear13),
    (v_preset2, v_gear34),
    (v_preset2, v_gear29);

  -- Preset 3: 雪线攀登 (12 items, ~9.4kg)
  -- Zodiac Plus, Atmos AG 65, Mammut硬壳, 凯乐石羽绒, 保温杯, Anker充电宝, Storm头灯,
  -- Leatherman Signal, Smartwool袜, 登山杖, 头盔, 冰爪
  INSERT INTO gear_preset_items (preset_id, item_id) VALUES
    (v_preset3, v_gear15),
    (v_preset3, v_gear3),
    (v_preset3, v_gear22),
    (v_preset3, v_gear21),
    (v_preset3, v_gear27),
    (v_preset3, v_gear9),
    (v_preset3, v_gear30),
    (v_preset3, v_gear33),
    (v_preset3, v_gear34),
    (v_preset3, v_gear13),
    (v_preset3, v_gear37),
    (v_preset3, v_gear39);

END $$;
