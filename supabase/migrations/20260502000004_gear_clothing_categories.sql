-- Add clothing layer categories: 羽绒服, 抓绒衣, 速干衣
-- Move misplaced items from 冲锋衣 to correct categories

-- Insert new categories
INSERT INTO gear_categories (id, name, icon, sort_order) VALUES
  ('b0000000-0000-0000-0000-000000000011', '羽绒服', 'down',   4),
  ('b0000000-0000-0000-0000-000000000013', '抓绒衣', 'fleece', 5),
  ('b0000000-0000-0000-0000-000000000012', '速干衣', 'tee',    6)
ON CONFLICT (id) DO NOTHING;

-- Shift existing categories sort_order to make room
UPDATE gear_categories SET sort_order = sort_order + 3
  WHERE sort_order >= 4
    AND id NOT IN (
      'b0000000-0000-0000-0000-000000000011',
      'b0000000-0000-0000-0000-000000000012',
      'b0000000-0000-0000-0000-000000000013'
    );

-- Move 轻量羽绒服 800蓬 from 冲锋衣 to 羽绒服
UPDATE gear_items SET category_id = 'b0000000-0000-0000-0000-000000000011'
  WHERE id = 'c0000000-0000-0000-0000-000000000021';

-- Move 合成棉保暖外套 from 冲锋衣 to 羽绒服
UPDATE gear_items SET category_id = 'b0000000-0000-0000-0000-000000000011'
  WHERE id = 'c0000000-0000-0000-0000-000000000020';

-- Add demo items only if demo user exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    -- 羽绒服
    INSERT INTO gear_items (id, user_id, category_id, name, brand, weight_g, price, condition, photo_url, notes, is_favorite, purchased_at) VALUES
      ('c0000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000011', '厚款羽绒服 700蓬', '北面', 580, 2299, 'good', 'https://example.com/gear/tnf-hmlyn-down.jpg', '700蓬厚款，冬季海坨山零下20度穿', false, '2024-11-01T00:00:00Z'),
      ('c0000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000011', '超轻羽绒马甲', '优衣库', 180, 399, 'fair', 'https://example.com/gear/uniqlo-downvest.jpg', '日线中间层，轻薄不占空间', false, '2023-10-20T00:00:00Z')
    ON CONFLICT (id) DO NOTHING;

    -- 抓绒衣
    INSERT INTO gear_items (id, user_id, category_id, name, brand, weight_g, price, condition, photo_url, notes, is_favorite, purchased_at) VALUES
      ('c0000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000013', 'R1抓绒衣', '巴塔哥尼亚', 350, 999, 'good', 'https://example.com/gear/patagonia-r1.jpg', '网格抓绒，透气排汗，三季中间层', true, '2024-02-10T00:00:00Z'),
      ('c0000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000013', '全拉链厚抓绒', '北面', 420, 799, 'good', 'https://example.com/gear/tnf-glacier-fleece.jpg', '厚实保暖，冬季营地穿', false, '2023-12-01T00:00:00Z'),
      ('c0000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000013', '轻量网格抓绒', '凯乐石', 220, 499, 'new', 'https://example.com/gear/kailas-grid-fleece.jpg', '超轻网格款，速干透气', false, '2025-03-10T00:00:00Z')
    ON CONFLICT (id) DO NOTHING;

    -- 速干衣
    INSERT INTO gear_items (id, user_id, category_id, name, brand, weight_g, price, condition, photo_url, notes, is_favorite, purchased_at) VALUES
      ('c0000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000012', '速干短袖T恤', '凯乐石', 120, 299, 'good', 'https://example.com/gear/kailas-quickdry-tee.jpg', '夏季日线首选，速干不贴身', false, '2024-05-15T00:00:00Z'),
      ('c0000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000012', '长袖防晒速干衣', '迪卡侬', 150, 199, 'good', 'https://example.com/gear/decathlon-uv-ls.jpg', 'UPF40+防晒，夏天灵山穿', true, '2024-06-01T00:00:00Z'),
      ('c0000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000012', '速干徒步裤', '始祖鸟', 280, 1599, 'new', 'https://example.com/gear/arcteryx-gamma-lt.jpg', '弹力速干面料，四季通用徒步裤', false, '2025-04-10T00:00:00Z')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
