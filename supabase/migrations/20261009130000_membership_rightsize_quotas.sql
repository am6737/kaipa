begin;

-- Publish new defaults without editing immutable policies or existing grants.
insert into public.resource_policies(version, features)
select replace(version, '-v1', '-v2'), features
from public.resource_policies
where version in ('free-v1', 'member-v1', 'open-v1');

insert into public.resource_policy_limits
  (policy_version, resource, period, commercial_limit, hard_limit, mode)
select replace(policy_version, '-v1', '-v2'), resource, period,
  case resource
    when 'gear_items' then case when policy_version='free-v1' then 100 else 500 end
    when 'journeys' then case when policy_version='free-v1' then 100 else 300 end
    when 'tracks' then case when policy_version='free-v1' then 300 else 1000 end
    when 'gear_recognition' then case when policy_version='free-v1' then 30 else 100 end
    when 'gear_cutouts' then case when policy_version='free-v1' then 30 else 100 end
    else commercial_limit
  end,
  hard_limit, mode
from public.resource_policy_limits
where policy_version in ('free-v1', 'member-v1', 'open-v1');

update public.resource_policies set published_at=now()
where version in ('free-v2', 'member-v2', 'open-v2');

-- Preserve separately configured policies and all historical grant promises.
update public.membership_runtime
set free_policy=case when free_policy='free-v1' then 'free-v2' else free_policy end,
    member_policy=case when member_policy='member-v1' then 'member-v2' else member_policy end,
    updated_at=now()
where free_policy='free-v1' or member_policy='member-v1';

update public.operation_campaigns set policy_version='open-v2'
where id='initial-open-access' and policy_version='open-v1';

commit;
