-- Deleting a category keeps its gear and moves it to the virtual
-- "Uncategorized" bucket by setting cat_id to null.

alter table gear_items alter column cat_id drop not null;
alter table gear_items drop constraint if exists gear_items_cat_id_fkey;
alter table gear_items
  add constraint gear_items_cat_id_fkey
  foreign key (cat_id) references gear_categories(id) on delete set null;
