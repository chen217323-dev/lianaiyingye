-- Owner-only reset for customizable rewards. Historical redemptions remain intact.
create or replace function public.love_clear_rewards() returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception 'Only owner may reset the shop'; end if;
 delete from public.love_reward_items;
end $$;
revoke execute on function public.love_clear_rewards() from public,anon;
grant execute on function public.love_clear_rewards() to authenticated;
