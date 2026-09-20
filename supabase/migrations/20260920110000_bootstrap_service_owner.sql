-- Bootstrap the dedicated service account as the first Kaipa admin owner.
-- This only changes Auth app metadata; it does not change the password.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
where lower(email) = 'service@hitosea.com';
