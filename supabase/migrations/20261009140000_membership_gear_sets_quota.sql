begin;

-- Published policies are immutable; preserve historical grant promises.
insert into public.resource_policies(version, features)
select replace(version, '-v2', '-v3'), features
from public.resource_policies
where version in ('free-v2', 'member-v2', 'open-v2');

insert into public.resource_policy_limits
  (policy_version, resource, period, commercial_limit, hard_limit, mode)
select replace(policy_version, '-v2', '-v3'), resource, period,
  case when resource='gear_sets' then 100 else commercial_limit end,
  hard_limit, mode
from public.resource_policy_limits
where policy_version in ('free-v2', 'member-v2', 'open-v2');

update public.resource_policies set published_at=now()
where version in ('free-v3', 'member-v3', 'open-v3');

update public.membership_runtime
set free_policy=case when free_policy='free-v2' then 'free-v3' else free_policy end,
    member_policy=case when member_policy='member-v2' then 'member-v3' else member_policy end,
    updated_at=now()
where free_policy='free-v2' or member_policy='member-v2';

update public.operation_campaigns set policy_version='open-v3'
where id='initial-open-access' and policy_version='open-v2';

commit;
