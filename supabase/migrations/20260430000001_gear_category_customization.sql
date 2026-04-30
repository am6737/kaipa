-- Gear category customization: add fields for user-level overrides and custom categories.

-- 1. Add new columns
ALTER TABLE gear_categories ADD COLUMN is_builtin boolean NOT NULL DEFAULT false;
ALTER TABLE gear_categories ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE gear_categories ADD COLUMN icon_type text NOT NULL DEFAULT 'svg'
  CHECK (icon_type IN ('svg', 'emoji'));
ALTER TABLE gear_categories ADD COLUMN builtin_ref uuid REFERENCES gear_categories(id);
ALTER TABLE gear_categories ADD COLUMN original_name text;

-- 2. Mark existing seed categories as built-in
UPDATE gear_categories SET is_builtin = true WHERE user_id IS NULL;

-- 3. Add "未分类" (Uncategorized) built-in category
INSERT INTO gear_categories (id, name, icon, icon_type, sort_order, is_builtin)
VALUES ('b0000000-0000-0000-0000-000000000000', '未分类', 'inbox', 'svg', 999, true);

-- 4. Unique constraint: one override per user per built-in category
ALTER TABLE gear_categories ADD CONSTRAINT uq_user_builtin_override UNIQUE (user_id, builtin_ref);

-- 5. Index for user-specific queries
CREATE INDEX idx_gear_categories_user ON gear_categories(user_id) WHERE user_id IS NOT NULL;

-- 6. Drop old permissive policy and replace with new granular ones
DROP POLICY IF EXISTS "gear_categories_public_read" ON gear_categories;

CREATE POLICY "gear_categories_select" ON gear_categories FOR SELECT USING (
  is_builtin = true OR user_id = auth.uid()
);

CREATE POLICY "gear_categories_insert" ON gear_categories FOR INSERT WITH CHECK (
  is_builtin = false AND user_id = auth.uid()
);

CREATE POLICY "gear_categories_update" ON gear_categories FOR UPDATE USING (
  is_builtin = false AND user_id = auth.uid()
);

CREATE POLICY "gear_categories_delete" ON gear_categories FOR DELETE USING (
  is_builtin = false AND user_id = auth.uid()
);
