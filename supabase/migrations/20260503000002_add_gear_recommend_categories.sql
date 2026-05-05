-- Add missing builtin gear categories needed by expanded recommendation rules
-- IDs: b14-b18

INSERT INTO gear_categories (id, name, icon, icon_type, sort_order, is_builtin) VALUES
  ('b0000000-0000-0000-0000-000000000014', '登山杖', 'trekking-pole', 'svg', 14, true),
  ('b0000000-0000-0000-0000-000000000015', '睡袋',   'sleeping-bag', 'svg', 15, true),
  ('b0000000-0000-0000-0000-000000000016', '急救包', 'first-aid',    'svg', 16, true),
  ('b0000000-0000-0000-0000-000000000017', '手套',   'gloves',       'svg', 17, true),
  ('b0000000-0000-0000-0000-000000000018', '厨具',   'cooking',      'svg', 18, true)
ON CONFLICT (id) DO NOTHING;
