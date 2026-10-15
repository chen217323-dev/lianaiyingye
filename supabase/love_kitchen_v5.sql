-- 《恋爱营业中》V5 厨房成长：老婆创菜、预约/口味、营业与厨房队列、10分评分与奖励、厨师经验
-- No existing accounts/wallets/orders are reset. Existing menu remains approved and available.
alter table public.love_dishes
 add column creator_id uuid references public.love_profiles(id) on delete set null,
 add column approval_status text not null default 'approved' check(approval_status in ('approved','pending','declined')),
 add column approval_note text not null default '',
 add column featured_today boolean not null default false,
 add column sold_out_today boolean not null default false;

alter table public.love_orders
 add column spice_level text not null default '正常' check(spice_level in ('正常','不辣','微辣','中辣','特辣')),
 add column taste_notes text not null default '',
 add column requested_at timestamptz,
 add column proposed_at timestamptz,
 add column ready_at timestamptz,
 add column delivered_at timestamptz;

alter table public.love_orders drop constraint love_orders_status_check;
alter table public.love_orders
 add constraint love_orders_status_check check(status in ('pending','preparing','ready','completed','cancelled'));

create table public.love_kitchen_settings(
 id int primary key default 1 check(id=1),
 is_open boolean not null default true,
 launched_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.love_kitchen_settings(id) values(1);

create table public.love_dish_reviews(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.love_orders(id) on delete cascade,
 reviewer_id uuid not null references public.love_profiles(id) on delete cascade,
 dish_id uuid references public.love_dishes(id) on delete set null,
 score integer not null check(score between 1 and 10),
 note text not null default '',
 bonus integer not null default 0 check(bonus in (0,5,10,15,20)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index love_reviews_dish on public.love_dish_reviews(dish_id,created_at desc);

create table public.love_chef_experience(
 order_id uuid primary key references public.love_orders(id) on delete cascade,
 chef_id uuid not null references public.love_profiles(id) on delete cascade,
 xp integer not null default 10 check(xp=10),
 granted_at timestamptz not null default now()
);

alter table public.love_kitchen_settings enable row level security;
alter table public.love_dish_reviews enable row level security;
alter table public.love_chef_experience enable row level security;

drop policy if exists member_dishes_read on public.love_dishes;
create policy member_dishes_read on public.love_dishes for select to authenticated
using(public.love_is_member());
create policy member_kitchen_read on public.love_kitchen_settings for select to authenticated
using(public.love_is_member());
create policy member_reviews_read on public.love_dish_reviews for select to authenticated
using(public.love_is_member());
create policy member_xp_read on public.love_chef_experience for select to authenticated
using(public.love_is_member());

revoke all on public.love_kitchen_settings,public.love_dish_reviews,public.love_chef_experience from anon,authenticated;
grant select on public.love_kitchen_settings,public.love_dish_reviews,public.love_chef_experience to authenticated;

-- User-created dishes remain unpriced proposals until husband approves.
create or replace function public.love_propose_dish(
 p_id uuid,p_name text,p_category text,p_emoji text,p_description text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare result_id uuid;
begin
 if not public.love_is_customer() then raise exception '只有老婆可以创建点名菜'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 1 and 50
   or char_length(trim(coalesce(p_category,''))) not between 1 and 30 then raise exception '菜名或分类格式有误'; end if;
 if p_id is null then
   insert into public.love_dishes(name,category,price,emoji,description,available,creator_id,approval_status,position)
   values(trim(p_name),trim(p_category),1,left(coalesce(nullif(p_emoji,''),'🍽️'),12),
    left(coalesce(p_description,''),240),false,auth.uid(),'pending',999)
   returning id into result_id;
 else
   update public.love_dishes
     set name=trim(p_name),category=trim(p_category),
       emoji=left(coalesce(nullif(p_emoji,''),'🍽️'),12),
       description=left(coalesce(p_description,''),240),
       approval_status='pending',approval_note='',available=false
     where id=p_id and creator_id=auth.uid() and approval_status in ('pending','approved','declined')
     returning id into result_id;
   if not found then raise exception '只能编辑自己的点名菜'; end if;
 end if;
 return result_id;
end $$;

create or replace function public.love_withdraw_dish(p_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_customer() then raise exception '只有老婆可以撤回自己的点名菜'; end if;
 delete from public.love_dishes where id=p_id and creator_id=auth.uid() and approval_status in ('pending','declined');
 if not found then raise exception '已上架的菜请先修改并重新提交审核'; end if;
end $$;

create or replace function public.love_review_proposed_dish(p_id uuid,p_approve boolean,p_price integer,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception '只有老公可以审核点名菜'; end if;
 if coalesce(p_approve,false) and (p_price is null or p_price not between 1 and 100000)
 then raise exception '请给菜品设置有效积分价格'; end if;
 update public.love_dishes
 set approval_status=case when p_approve then 'approved' else 'declined' end,
     approval_note=left(coalesce(p_note,''),200),
     price=case when p_approve then p_price else price end,
     available=coalesce(p_approve,false),
     sold_out_today=false
 where id=p_id and creator_id is not null and approval_status='pending';
 if not found then raise exception '此菜已审核或已撤回'; end if;
end $$;

create or replace function public.love_kitchen_open(p_open boolean) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception '只有老公可以调整营业状态'; end if;
 update public.love_kitchen_settings set is_open=coalesce(p_open,false),updated_at=now() where id=1;
end $$;

create or replace function public.love_kitchen_mark_dish(p_id uuid,p_featured boolean,p_sold_out boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception '只有老公可以设置推荐与售罄'; end if;
 update public.love_dishes set featured_today=p_featured,sold_out_today=p_sold_out
 where id=p_id and approval_status='approved';
 if not found then raise exception '仅已批准的菜可设置供应状态'; end if;
end $$;

-- Old save-dish RPC is still available to husband, but never silently approves proposals.
create or replace function public.love_save_dish(
 p_id uuid,p_name text,p_category text,p_price integer,p_emoji text,p_description text,p_available boolean,p_position integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare rid uuid;
begin
 if not public.love_is_owner() then raise exception '只有老公能定价与管理正式菜品'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 1 and 50 or
 p_price not between 1 and 100000 then raise exception '菜名或积分价格无效'; end if;
 if p_id is null then
  insert into public.love_dishes(name,category,price,emoji,description,available,position,approval_status)
  values(trim(p_name),left(coalesce(p_category,'其他'),30),p_price,
  left(coalesce(p_emoji,'🍽️'),12),left(coalesce(p_description,''),240),
  coalesce(p_available,true),coalesce(p_position,0),'approved') returning id into rid;
 else
  update public.love_dishes set name=trim(p_name),category=left(coalesce(p_category,'其他'),30),
  price=p_price,emoji=left(coalesce(p_emoji,'🍽️'),12),
  description=left(coalesce(p_description,''),240),
  available=coalesce(p_available,true),position=coalesce(p_position,0)
  where id=p_id and approval_status='approved' returning id into rid;
  if not found then raise exception '待审核菜品请先处理审核'; end if;
 end if;
 return rid;
end $$;

-- New order RPC; existing love_place_order still redirects into this new secure flow.
create or replace function public.love_place_kitchen_order(
 p_dish_id uuid,p_note text,p_spice_level text,p_taste_notes text,p_requested_at timestamptz
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 d public.love_dishes%rowtype;
 new_order uuid;
 paid_balance integer;
begin
 if not public.love_is_customer() then raise exception '仅老婆可以点菜'; end if;
 if not (select is_open from public.love_kitchen_settings where id=1) then
   raise exception '厨房暂时休息，等老公开门再来点餐吧'; end if;
 select * into d from public.love_dishes
 where id=p_dish_id and available=true and approval_status='approved' and sold_out_today=false for share;
 if not found then raise exception '该菜尚未上架或已售罄'; end if;
 if coalesce(p_spice_level,'正常') not in ('正常','不辣','微辣','中辣','特辣') then raise exception '辣度选择有误'; end if;
 if p_requested_at is not null and (p_requested_at<now() or p_requested_at>now()+interval '60 days')
 then raise exception '预约需要在未来60天内'; end if;
 update public.love_wallets set balance=balance-d.price,updated_at=now()
 where customer_id=auth.uid() and balance>=d.price
 returning balance into paid_balance;
 if not found then raise exception '积分不足'; end if;
 insert into public.love_orders(customer_id,dish_id,dish_name,price,note,spice_level,taste_notes,requested_at)
 values(auth.uid(),d.id,d.name,d.price,left(coalesce(p_note,''),300),
 coalesce(p_spice_level,'正常'),left(coalesce(p_taste_notes,''),300),p_requested_at)
 returning id into new_order;
 insert into public.love_wallet_events(customer_id,source_key,delta,reason)
 values(auth.uid(),'order:'||new_order::text,-d.price,'点菜：'||d.name);
 return new_order;
end $$;

create or replace function public.love_place_order(p_dish_id uuid,p_note text) returns uuid
language sql security definer set search_path=''
as $$
 select public.love_place_kitchen_order(p_dish_id,p_note,'正常','',null);
$$;

-- Time adjustment: husband proposes, wife confirms; never mutates original price.
create or replace function public.love_propose_order_time(p_order_id uuid,p_time timestamptz)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception '只有老公可以提出改期'; end if;
 if p_time<now() or p_time>now()+interval '60 days' then raise exception '请选择60天内的未来时间'; end if;
 update public.love_orders set proposed_at=p_time,updated_at=now()
 where id=p_order_id and status='pending';
 if not found then raise exception '只能为待接单订单改期'; end if;
end $$;

create or replace function public.love_accept_order_time(p_order_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_customer() then raise exception '只有老婆能确认预约时间'; end if;
 update public.love_orders
 set requested_at=case when p_accept then proposed_at else requested_at end,
 proposed_at=null,updated_at=now()
 where id=p_order_id and customer_id=auth.uid() and status='pending' and proposed_at is not null;
 if not found then raise exception '没有待确认的预约调整'; end if;
end $$;

-- Existing function advanced pending -> preparing -> completed; now add ready state.
create or replace function public.love_advance_order(p_order_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
declare
 o public.love_orders%rowtype;
 chef uuid;
 issued_xp integer;
 today_start timestamptz;
begin
 if not public.love_is_owner() then raise exception '仅老公可以制作与送达'; end if;
 select * into o from public.love_orders where id=p_order_id for update;
 if not found then raise exception '订单不存在'; end if;
 if o.status='pending' then
   update public.love_orders set status='preparing',proposed_at=null,updated_at=now() where id=o.id;
 elsif o.status='preparing' then
   update public.love_orders set status='ready',ready_at=now(),updated_at=now() where id=o.id;
 elsif o.status='ready' then
   select id into chef from public.love_profiles where role='owner';
   if chef is null then raise exception '老公账号尚未配置'; end if;
   update public.love_orders set status='completed',delivered_at=now(),updated_at=now() where id=o.id;
   insert into public.love_wallets(customer_id,balance) values(chef,o.price)
   on conflict(customer_id) do update set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
   insert into public.love_wallet_events(customer_id,source_key,delta,reason)
   values(chef,'cooked:'||o.id::text,o.price,'完成做饭收入：'||o.dish_name);
   if o.created_at >= (select launched_at from public.love_kitchen_settings where id=1) then
     today_start := (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
     perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xp:'||chef::text,0));
     if (select count(*) from public.love_chef_experience
       where chef_id=chef and granted_at>=today_start)<3 then
       insert into public.love_chef_experience(order_id,chef_id,xp) values(o.id,chef,10);
     end if;
   end if;
 else
   raise exception '该订单已经结束，不能重复结算';
 end if;
end $$;

-- Real one-time 10 point review, fixed score, editable wording; maximum three bonus-bearing reviews/day.
create or replace function public.love_rate_dish(p_order_id uuid,p_score integer,p_note text)
returns integer language plpgsql security definer set search_path=''
as $$
declare
 o public.love_orders%rowtype;
 chef uuid;
 reward integer;
 day_start timestamptz;
 launch_time timestamptz;
begin
 if not public.love_is_customer() then raise exception '只有老婆可以为菜品打分'; end if;
 if p_score not between 1 and 10 then raise exception '评分必须为1到10分'; end if;
 select * into o from public.love_orders
 where id=p_order_id and customer_id=auth.uid() and status='completed' for update;
 if not found then raise exception '只能评价自己已经吃过的订单'; end if;
 if exists(select 1 from public.love_dish_reviews where order_id=p_order_id) then
   raise exception '此订单已经评价过啦，不能重复领奖'; end if;
 select id into chef from public.love_profiles where role='owner';
 select launched_at into launch_time from public.love_kitchen_settings where id=1;
 reward:=case when p_score<=3 then 0 when p_score<=5 then 5
   when p_score<=7 then 10 when p_score<=9 then 15 else 20 end;
 if o.created_at<launch_time then reward:=0; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review:'||chef::text,0));
 day_start:=(date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
 if (select count(*) from public.love_dish_reviews
   where bonus>0 and created_at>=day_start)>=3 then reward:=0; end if;
 insert into public.love_dish_reviews(order_id,reviewer_id,dish_id,score,note,bonus)
 values(o.id,auth.uid(),o.dish_id,p_score,left(coalesce(p_note,''),350),reward);
 if reward>0 then
   insert into public.love_wallets(customer_id,balance) values(chef,reward)
   on conflict(customer_id) do update set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
   insert into public.love_wallet_events(customer_id,source_key,delta,reason)
   values(chef,'rating:'||o.id::text,reward,'老婆美食评分'||p_score||'分：'||o.dish_name);
 end if;
 return reward;
end $$;

create or replace function public.love_update_review_note(p_order_id uuid,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_customer() then raise exception '仅老婆能修改自己的评价'; end if;
 update public.love_dish_reviews
 set note=left(coalesce(p_note,''),350),updated_at=now()
 where order_id=p_order_id and reviewer_id=auth.uid();
 if not found then raise exception '未找到自己的评价'; end if;
end $$;

revoke execute on function
 public.love_propose_dish(uuid,text,text,text,text),
 public.love_withdraw_dish(uuid),
 public.love_review_proposed_dish(uuid,boolean,integer,text),
 public.love_kitchen_open(boolean),
 public.love_kitchen_mark_dish(uuid,boolean,boolean),
 public.love_place_kitchen_order(uuid,text,text,text,timestamptz),
 public.love_propose_order_time(uuid,timestamptz),
 public.love_accept_order_time(uuid,boolean),
 public.love_rate_dish(uuid,integer,text),
 public.love_update_review_note(uuid,text)
from public,anon;
grant execute on function
 public.love_propose_dish(uuid,text,text,text,text),
 public.love_withdraw_dish(uuid),
 public.love_review_proposed_dish(uuid,boolean,integer,text),
 public.love_kitchen_open(boolean),
 public.love_kitchen_mark_dish(uuid,boolean,boolean),
 public.love_place_kitchen_order(uuid,text,text,text,timestamptz),
 public.love_propose_order_time(uuid,timestamptz),
 public.love_accept_order_time(uuid,boolean),
 public.love_rate_dish(uuid,integer,text),
 public.love_update_review_note(uuid,text)
to authenticated;

do $$
declare tbl text;
begin
 foreach tbl in array array['love_dish_reviews','love_chef_experience','love_kitchen_settings'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename=tbl) then
    execute pg_catalog.format('alter publication supabase_realtime add table public.%I',tbl);
   end if;
 end loop;
end $$;
