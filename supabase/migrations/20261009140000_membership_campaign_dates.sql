begin;

-- Expose the start date of the same active campaign selected by the status RPC.
create or replace function public.get_membership_status()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v jsonb; resources jsonb;
begin
  if auth.uid() is null then raise exception using message='Authentication required',errcode='42501'; end if;
  perform public.ensure_membership_transitions(auth.uid());
  v:=public.get_membership_status_base();
  if v->'campaign' <> 'null'::jsonb then
    v:=jsonb_set(v,'{campaign}',v->'campaign'||jsonb_build_object('startsAt',(
      select starts_at from public.operation_campaigns where id=v->'campaign'->>'id')));
  end if;
  select jsonb_agg(item||jsonb_build_object('tracking',case
    when item->>'resource' in ('gear_items','gear_sets','journeys','tracks','ai_requests','ai_plans','gear_recognition','gear_cutouts','storage_bytes') then 'live'
    else item->>'tracking' end)) into resources from jsonb_array_elements(v->'resources') item;
  return v||jsonb_build_object('meteringStartedAt',(select metering_started_at from public.membership_runtime),'products',(select jsonb_agg(p order by term_months nulls last) from public.membership_products p),'resources',resources,'transitionEndsAt',(
    select max(expires_at) from public.resource_transition_grants where user_id=auth.uid() and expires_at>now()));
end $$;

commit;
