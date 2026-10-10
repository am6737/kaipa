begin;

-- Change only the free default; published policies and historical grants remain immutable.
insert into public.resource_policies(version, features)
select 'free-v4', features
from public.resource_policies
where version='free-v3';

insert into public.resource_policy_limits
  (policy_version, resource, period, commercial_limit, hard_limit, mode)
select 'free-v4', resource, period,
  case when resource='gear_sets' then 20 else commercial_limit end,
  hard_limit, mode
from public.resource_policy_limits
where policy_version='free-v3';

update public.resource_policies set published_at=now()
where version='free-v4';

update public.membership_runtime
set free_policy='free-v4', updated_at=now()
where free_policy='free-v3';

commit;
