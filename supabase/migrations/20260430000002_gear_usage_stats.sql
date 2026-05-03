-- Add usage tracking columns to gear_items
ALTER TABLE gear_items
  ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_distance_km numeric NOT NULL DEFAULT 0;

-- Back-fill from existing trip data
-- Trip 1 (jiankou): 13.1 km, gear: gear1, gear4, gear5, gear8, gear10, gear37
-- Trip 2 (xiangshan): 7.2 km, gear: gear2, gear8
-- Trip 3 (yunmeng): 15.8 km, gear: gear1, gear3, gear5, gear8, gear9, gear10, gear13, gear34

UPDATE gear_items SET use_count = 2, total_distance_km = 28.9
  WHERE id IN ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005');

UPDATE gear_items SET use_count = 3, total_distance_km = 36.1
  WHERE id = 'c0000000-0000-0000-0000-000000000008';

UPDATE gear_items SET use_count = 2, total_distance_km = 28.9
  WHERE id = 'c0000000-0000-0000-0000-000000000010';

UPDATE gear_items SET use_count = 1, total_distance_km = 13.1
  WHERE id IN (
    'c0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000037'
  );

UPDATE gear_items SET use_count = 1, total_distance_km = 7.2
  WHERE id = 'c0000000-0000-0000-0000-000000000002';

UPDATE gear_items SET use_count = 1, total_distance_km = 15.8
  WHERE id IN (
    'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000009',
    'c0000000-0000-0000-0000-000000000013',
    'c0000000-0000-0000-0000-000000000034'
  );
