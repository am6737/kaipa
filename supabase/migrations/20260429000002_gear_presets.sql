-- gear_presets: user's named gear loadouts
CREATE TABLE gear_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gear_presets_user ON gear_presets(user_id);
ALTER TABLE gear_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own presets"
  ON gear_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own presets"
  ON gear_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own presets"
  ON gear_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own presets"
  ON gear_presets FOR DELETE USING (auth.uid() = user_id);

-- gear_preset_items: join table linking presets to gear items
CREATE TABLE gear_preset_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id  uuid NOT NULL REFERENCES gear_presets(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, item_id)
);

CREATE INDEX idx_gear_preset_items_preset ON gear_preset_items(preset_id);
ALTER TABLE gear_preset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own preset items"
  ON gear_preset_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM gear_presets WHERE id = preset_id AND user_id = auth.uid()));
CREATE POLICY "Users add to own presets"
  ON gear_preset_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gear_presets WHERE id = preset_id AND user_id = auth.uid()));
CREATE POLICY "Users remove from own presets"
  ON gear_preset_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM gear_presets WHERE id = preset_id AND user_id = auth.uid()));
