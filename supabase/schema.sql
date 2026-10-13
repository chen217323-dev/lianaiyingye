-- 《恋爱营业中》双人云端版 · Supabase 初始化 SQL
-- 用于全新的专属 Supabase 项目，不要在其他项目运行。
-- 账号创建方式：先在 Supabase Authentication -> Users 创建两名用户，
-- 再将真实 UUID 填入下方文档中的角色设置 SQL（不要在公开 GitHub 写邮箱或密码）。
-- 每一笔积分变动只可由受保护的数据库函数执行；不能从浏览器直接改余额。

create extension if not exists pgcrypto;

create table if not exists public.love_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','customer')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists love_profiles_one_per_role on public.love_profiles(role);

create table if not exists public.love_dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 50),
  category text not null default '其他' check(char_length(category) between 1 and 30),
  price integer not null check(price between 1 and 100000),
  emoji text not null default '🍽️',
  description text not null default '',
  available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.love_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 60),
  category text not null default '甜蜜互动',
  reward integer not null check(reward between 1 and 10000),
  emoji text not null default '💌',
  description text not null default '',
  active boolean not null default true,
  invite_only boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.love_wallets (
  customer_id uuid primary key references public.love_profiles(id) on delete cascade,
  balance integer not null default 0 check(balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.love_wallet_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.love_profiles(id) on delete cascade,
  source_key text not null,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(customer_id,source_key)
);

create table if not exists public.love_task_claims (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.love_profiles(id) on delete cascade,
  task_id uuid references public.love_tasks(id) on delete set null,
  task_name text not null,
  reward integer not null,
  claim_day date not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(customer_id,task_id,claim_day)
);

create table if not exists public.love_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.love_profiles(id) on delete cascade,
  dish_id uuid references public.love_dishes(id) on delete set null,
  dish_name text not null,
  price integer not null check(price > 0),
  note text not null default '',
  status text not null default 'pending' check(status in ('pending','preparing','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists love_orders_customer_recent on public.love_orders(customer_id,created_at desc);
create index if not exists love_claims_recent on public.love_task_claims(customer_id,claim_day desc);

-- 唯有已分配角色的两个账号能看对应数据。
create or replace function public.love_is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$select exists(select 1 from public.love_profiles where id=auth.uid() and role='owner')$$;
create or replace function public.love_is_customer() returns boolean
language sql stable security definer set search_path = ''
as $$select exists(select 1 from public.love_profiles where id=auth.uid() and role='customer')$$;
create or replace function public.love_is_member() returns boolean
language sql stable security definer set search_path = ''
as $$select exists(select 1 from public.love_profiles where id=auth.uid())$$;

alter table public.love_profiles enable row level security;
alter table public.love_dishes enable row level security;
alter table public.love_tasks enable row level security;
alter table public.love_wallets enable row level security;
alter table public.love_wallet_events enable row level security;
alter table public.love_task_claims enable row level security;
alter table public.love_orders enable row level security;

create policy "member_profile_read" on public.love_profiles for select to authenticated
using(id=auth.uid() or public.love_is_owner());
create policy "member_dishes_read" on public.love_dishes for select to authenticated
using(public.love_is_member() and (available or public.love_is_owner()));
create policy "member_tasks_read" on public.love_tasks for select to authenticated
using(public.love_is_member() and (active or public.love_is_owner()));
create policy "member_wallet_read" on public.love_wallets for select to authenticated
using(customer_id=auth.uid() or public.love_is_owner());
create policy "member_events_read" on public.love_wallet_events for select to authenticated
using(customer_id=auth.uid() or public.love_is_owner());
create policy "member_claims_read" on public.love_task_claims for select to authenticated
using(customer_id=auth.uid() or public.love_is_owner());
create policy "member_orders_read" on public.love_orders for select to authenticated
using(customer_id=auth.uid() or public.love_is_owner());
-- 刻意不提供 INSERT/UPDATE/DELETE RLS policy：客户端只能调用下面经过权限验证的 RPC。

create or replace function public.love_daily_checkin() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone 'Asia/Seoul')::date;
  changed integer;
  total integer;
begin
  if uid is null or not public.love_is_customer() then raise exception 'Only customer can check in'; end if;
  insert into public.love_wallets(customer_id,balance) values(uid,0) on conflict do nothing;
  insert into public.love_wallet_events(customer_id,source_key,delta,reason)
  values(uid,'login:'||d::text,50,'每日登录 +50 积分')
  on conflict(customer_id,source_key) do nothing;
  get diagnostics changed=row_count;
  if changed=1 then
    update public.love_wallets set balance=balance+50,updated_at=now() where customer_id=uid;
  end if;
  select balance into total from public.love_wallets where customer_id=uid;
  return jsonb_build_object('awarded',changed=1,'balance',total);
end;$$;

create or replace function public.love_claim_task(p_task_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  t public.love_tasks%rowtype;
  claim_id uuid;
begin
  if not public.love_is_customer() then raise exception 'Only customer can claim tasks'; end if;
  select * into t from public.love_tasks where id=p_task_id and active=true;
  if not found then raise exception 'Task is unavailable'; end if;
  insert into public.love_task_claims(customer_id,task_id,task_name,reward,claim_day)
  values(auth.uid(),t.id,t.name,t.reward,(now() at time zone 'Asia/Seoul')::date)
  on conflict(customer_id,task_id,claim_day) do nothing
  returning id into claim_id;
  if claim_id is null then raise exception 'Already claimed today'; end if;
  return claim_id;
end;$$;

create or replace function public.love_review_claim(p_claim_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.love_task_claims%rowtype;
begin
  if not public.love_is_owner() then raise exception 'Only owner can review'; end if;
  select * into c from public.love_task_claims where id=p_claim_id for update;
  if not found or c.status <> 'pending' then raise exception 'Claim was already handled'; end if;
  update public.love_task_claims set status=(case when p_approve then 'approved' else 'rejected' end),reviewed_at=now() where id=c.id;
  if p_approve then
    insert into public.love_wallets(customer_id,balance)
      values(c.customer_id,c.reward)
      on conflict(customer_id) do update
        set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
    insert into public.love_wallet_events(customer_id,source_key,delta,reason)
      values(c.customer_id,'task:'||c.id::text,c.reward,'完成任务：'||c.task_name);
  end if;
end;$$;

create or replace function public.love_place_order(p_dish_id uuid,p_note text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  d public.love_dishes%rowtype;
  order_id uuid;
  updated_balance integer;
begin
  if not public.love_is_customer() then raise exception 'Only customer can place orders'; end if;
  select * into d from public.love_dishes where id=p_dish_id and available=true for share;
  if not found then raise exception 'Dish is unavailable'; end if;
  update public.love_wallets set balance=balance-d.price,updated_at=now()
  where customer_id=auth.uid() and balance>=d.price
  returning balance into updated_balance;
  if not found then raise exception 'Not enough points'; end if;
  insert into public.love_orders(customer_id,dish_id,dish_name,price,note)
  values(auth.uid(),d.id,d.name,d.price,left(coalesce(p_note,''),300)) returning id into order_id;
  insert into public.love_wallet_events(customer_id,source_key,delta,reason)
  values(auth.uid(),'order:'||order_id::text,-d.price,'点菜：'||d.name);
  return order_id;
end;$$;

create or replace function public.love_cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  o public.love_orders%rowtype;
begin
  select * into o from public.love_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (public.love_is_owner() or (public.love_is_customer() and o.customer_id=auth.uid())) then
    raise exception 'Not permitted'; end if;
  if o.status='cancelled' or o.status='completed' or (o.status='preparing' and not public.love_is_owner()) then
    raise exception 'Order cannot be cancelled'; end if;
  update public.love_orders set status='cancelled',updated_at=now() where id=o.id;
  insert into public.love_wallets(customer_id,balance)
  values(o.customer_id,o.price)
  on conflict(customer_id) do update
  set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
  insert into public.love_wallet_events(customer_id,source_key,delta,reason)
  values(o.customer_id,'refund:'||o.id::text,o.price,'订单取消退款：'||o.dish_name);
end;$$;

create or replace function public.love_advance_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare o public.love_orders%rowtype;
begin
  if not public.love_is_owner() then raise exception 'Only owner can update orders'; end if;
  select * into o from public.love_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status='pending' then
    update public.love_orders set status='preparing',updated_at=now() where id=o.id;
  elsif o.status='preparing' then
    update public.love_orders set status='completed',updated_at=now() where id=o.id;
  else raise exception 'Order already closed';
  end if;
end;$$;

create or replace function public.love_save_dish(
  p_id uuid,p_name text,p_category text,p_price integer,p_emoji text,p_description text,p_available boolean,p_position integer
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare rid uuid;
begin
  if not public.love_is_owner() then raise exception 'Only owner can edit dishes'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 50
     or p_price not between 1 and 100000 then raise exception 'Invalid dish'; end if;
  if p_id is null then
    insert into public.love_dishes(name,category,price,emoji,description,available,position)
    values(trim(p_name),left(coalesce(p_category,'其他'),30),p_price,left(coalesce(p_emoji,'🍽️'),12),left(coalesce(p_description,''),240),coalesce(p_available,true),coalesce(p_position,0))
    returning id into rid;
  else
    update public.love_dishes set name=trim(p_name),category=left(coalesce(p_category,'其他'),30),
    price=p_price,emoji=left(coalesce(p_emoji,'🍽️'),12),
    description=left(coalesce(p_description,''),240),available=coalesce(p_available,true),
    position=coalesce(p_position,0) where id=p_id returning id into rid;
    if rid is null then raise exception 'Dish not found'; end if;
  end if;
  return rid;
end;$$;

create or replace function public.love_delete_dish(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.love_is_owner() then raise exception 'Only owner can delete dishes'; end if;
  delete from public.love_dishes where id=p_id;
end;$$;

create or replace function public.love_save_task(
  p_id uuid,p_name text,p_category text,p_reward integer,p_emoji text,p_description text,p_active boolean,p_invite_only boolean,p_position integer
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare rid uuid;
begin
  if not public.love_is_owner() then raise exception 'Only owner can edit tasks'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 60
     or p_reward not between 1 and 10000 then raise exception 'Invalid task'; end if;
  if p_id is null then
    insert into public.love_tasks(name,category,reward,emoji,description,active,invite_only,position)
    values(trim(p_name),left(coalesce(p_category,'自定义'),30),p_reward,left(coalesce(p_emoji,'💌'),12),left(coalesce(p_description,''),300),coalesce(p_active,true),coalesce(p_invite_only,false),coalesce(p_position,0))
    returning id into rid;
  else
    update public.love_tasks set name=trim(p_name),category=left(coalesce(p_category,'自定义'),30),
    reward=p_reward,emoji=left(coalesce(p_emoji,'💌'),12),
    description=left(coalesce(p_description,''),300),active=coalesce(p_active,true),
    invite_only=coalesce(p_invite_only,false),position=coalesce(p_position,0)
    where id=p_id returning id into rid;
    if rid is null then raise exception 'Task not found'; end if;
  end if;
  return rid;
end;$$;

create or replace function public.love_delete_task(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.love_is_owner() then raise exception 'Only owner can delete tasks'; end if;
  delete from public.love_tasks where id=p_id;
end;$$;

-- 列级写入权限和关键数据的存储保护：
revoke all on public.love_profiles,public.love_dishes,public.love_tasks,public.love_wallets,
  public.love_wallet_events,public.love_task_claims,public.love_orders from anon;
revoke insert,update,delete on public.love_profiles,public.love_dishes,public.love_tasks,
  public.love_wallets,public.love_wallet_events,public.love_task_claims,public.love_orders from authenticated;
grant select on public.love_profiles,public.love_dishes,public.love_tasks,public.love_wallets,
  public.love_wallet_events,public.love_task_claims,public.love_orders to authenticated;

revoke execute on function
  public.love_is_owner(),public.love_is_customer(),public.love_is_member(),
  public.love_daily_checkin(),public.love_claim_task(uuid),public.love_review_claim(uuid,boolean),
  public.love_place_order(uuid,text),public.love_cancel_order(uuid),public.love_advance_order(uuid),
  public.love_save_dish(uuid,text,text,integer,text,text,boolean,integer),
  public.love_delete_dish(uuid),
  public.love_save_task(uuid,text,text,integer,text,text,boolean,boolean,integer),
  public.love_delete_task(uuid)
from public,anon;
grant execute on function
  public.love_is_owner(),public.love_is_customer(),public.love_is_member(),
  public.love_daily_checkin(),public.love_claim_task(uuid),public.love_review_claim(uuid,boolean),
  public.love_place_order(uuid,text),public.love_cancel_order(uuid),public.love_advance_order(uuid),
  public.love_save_dish(uuid,text,text,integer,text,text,boolean,integer),
  public.love_delete_dish(uuid),
  public.love_save_task(uuid,text,text,integer,text,text,boolean,boolean,integer),
  public.love_delete_task(uuid)
to authenticated;

-- 开启订单、积分、任务的实时数据库变更广播。
do $$
declare table_name_item text;
begin
  foreach table_name_item in array array['love_dishes','love_tasks','love_orders','love_task_claims','love_wallets','love_wallet_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name_item) then
      execute format('alter publication supabase_realtime add table public.%I',table_name_item);
    end if;
  end loop;
end $$;

-- 用给定的22道菜初始化菜单（只添加不存在的菜名）。
insert into public.love_dishes(name,category,price,emoji,description,position)
select v.name,v.category,v.price,v.emoji,'陈哥手作 · 用心出品',v.position
from (values
('番茄豆腐','素菜类',45,'🍅',1),('小抄西葫芦','素菜类',45,'🥒',2),('手撕包菜','素菜类',45,'🥬',3),
('辣椒炒蘑菇','素菜类',50,'🍄',4),('凉拌粉条','素菜类',50,'🥢',5),('狼牙土豆','素菜类',55,'🥔',6),
('洋葱炒鸡蛋','素菜类',50,'🧅',7),('番茄炒鸡蛋','素菜类',50,'🍳',8),('云南米线','素菜类',80,'🍜',9),
('陈哥黄焖鸡','肉类',110,'🍗',10),('陈哥红烧肉','肉类',120,'🥩',11),('陈哥鱼香肉丝','肉类',95,'🥢',12),
('陈哥柠檬手撕鸡','肉类',100,'🍋',13),('陈哥肉酱','肉类',90,'🍝',14),('辣椒炒肉','肉类',90,'🌶️',15),
('黄油大虾','肉类',140,'🍤',16),('麻辣肥牛','肉类',125,'🥘',17),
('白菜豆腐圆子汤','汤类',55,'🥣',18),('黄瓜鸡蛋汤','汤类',35,'🍲',19),
('番茄鸡蛋汤','汤类',35,'🥣',20),('鱼籽炒饭','饭类',80,'🍚',21),('酱油炒饭','饭类',60,'🍛',22)
) as v(name,category,price,emoji,position)
where not exists(select 1 from public.love_dishes d where d.name=v.name);

insert into public.love_tasks(name,category,reward,emoji,description,invite_only,position)
select v.name,v.category,v.reward,v.emoji,v.description,v.invite_only,v.position from (values
('夸夸老公三个优点','甜蜜互动',20,'👏','真诚地夸夸老公',false,1),
('给老公一个抱抱','甜蜜互动',30,'🫂','双方愿意时来一个抱抱',false,2),
('整理一下小房间','日常小事',50,'🧹','让生活环境更舒适',false,3),
('一起散步20分钟','约会时光',60,'🚶','两个人慢慢走，慢慢聊',false,4),
('亲一口老公','甜蜜互动',30,'😘','亲亲要双方愿意',false,5),
('跟老公说我爱你','甜蜜互动',25,'💌','当面说或者发消息都可以',false,6),
('今晚跟老公嘿嘿嘿？','亲密邀请',50,'🙈','自愿提出邀请即可申请积分；无需履行亲密行为，不需证明',true,7),
('给老公一句土味情话','甜蜜互动',20,'🥰','越肉麻越好',false,8),
('偷偷牵老公的手','甜蜜互动',15,'🤝','彼此愿意时的小惊喜',false,9),
('抱着老公贴贴一分钟','甜蜜互动',30,'🧸','双方都想贴贴才参与',false,10),
('给老公一个专属昵称','趣味挑战',20,'🐣','昵称越离谱，老公越难忘',false,11),
('和老公互相夸夸','趣味挑战',25,'✨','互相真诚夸一句',false,12),
('邀请老公一起看电影','约会时光',35,'🎬','一起选电影',false,13),
('晚安前说一句悄悄话','甜蜜互动',20,'🌙','睡前的小秘密',false,14)
) as v(name,category,reward,emoji,description,invite_only,position)
where not exists(select 1 from public.love_tasks t where t.name=v.name);

-- 手动为两位账号分配身份（仅在 Supabase SQL Editor 中执行，不能将具体 UUID 放进公开仓库）：
-- insert into public.love_profiles(id,role,display_name)
-- values ('老公的 auth.users UUID'::uuid,'owner','老公'),
--        ('老婆的 auth.users UUID'::uuid,'customer','老婆');
-- 客户首次登录时，love_daily_checkin() 会自动创建积分账户并加 50。
