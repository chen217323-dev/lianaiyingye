-- Update only display copy; keep auth IDs, internal roles ('owner'/'customer'), wallets and histories unchanged.
update public.love_profiles
set display_name='老公'
where role='owner' and display_name is distinct from '老公';

update public.love_tasks
set name=replace(name,'老板','老公'),
    description=replace(description,'老板','老公')
where name like '%老板%' or description like '%老板%';

update public.love_dishes
set name=replace(name,'老板','老公'),
    description=replace(description,'老板','老公')
where name like '%老板%' or description like '%老板%';

update public.love_reward_items
set name=replace(name,'老板','老公'),
    description=replace(description,'老板','老公')
where name like '%老板%' or description like '%老板%';
