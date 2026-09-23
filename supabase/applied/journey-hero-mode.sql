-- Choose whether a journey detail opens with its track map or cover photo.
alter table journeys
  add column if not exists hero_mode text
  check (hero_mode in ('track', 'cover'));
