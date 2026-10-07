-- Demo gallery for the 党岭三湖连穿 route card.
-- Keep these as ordinary public image URLs so the carousel can be previewed
-- before user uploaded route media is wired in.
update routes
set photo_uris = '[
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?fm=jpg&q=80&w=1400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?fm=jpg&q=80&w=1400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?fm=jpg&q=80&w=1400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?fm=jpg&q=80&w=1400&auto=format&fit=crop"
]'::jsonb
where id = 'trk008';
