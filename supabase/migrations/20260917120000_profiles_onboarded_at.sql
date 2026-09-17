-- Onboarding completion lives on the profile so it follows the account across
-- devices and sign-in methods, instead of a per-device AsyncStorage flag.
-- null = 还没走完引导；非 null = 已跳过或完成。
alter table public.profiles add column if not exists onboarded_at timestamptz;
