-- 《恋爱营业中》V3 · 自定义商城、愿望树、私密信箱
-- Uses existing auth.users, love_profiles (owner/customer), love_wallets and wallet_events.
-- New browser features do not have permission to modify points directly.

create table public.love_reward_items(
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 1 and 60),
 category text not null default '甜蜜福利',
 price integer not null check(price between 1 and 100000),
 emoji text not null default '🎁',
 description text not null default '',
 stock integer check(stock is null or stock >= 0), -- NULL = unlimited
 available boolean not null default true,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create table public.love_reward_redemptions(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 customer_id uuid not null references public.love_profiles(id) on delete cascade,
 item_id uuid references public.love_reward_items(id) on delete set null,
 item_name text not null,
 price integer not null check(price>0),
 note text not null default '',
 status text not null default 'pending' check(status in ('pending','fulfilled','refunded')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index love_redemptions_by_date on public.love_reward_redemptions(created_at desc);

create table public.love_wishes(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.love_profiles(id) on delete cascade,
 claimed_by uuid references public.love_profiles(id) on delete set null,
 title text not null check(char_length(trim(title)) between 1 and 90),
 description text not null default '',
 category text not null default '小愿望',
 desired_date date,
 status text not null default 'open' check(status in ('open','claimed','done')),
 memory_note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz
);
create index love_wishes_recent on public.love_wishes(created_at desc);

create table public.love_letters(
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.love_profiles(id) on delete cascade,
 recipient_id uuid not null references public.love_profiles(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 1000),
 unlock_at timestamptz not null default now(),
 read_at timestamptz,
 created_at timestamptz not null default now(),
 check(sender_id <> recipient_id)
);
create index love_letters_inbox on public.love_letters(recipient_id,created_at desc);
create index love_letters_sent on public.love_letters(sender_id,created_at desc);

alter table public.love_reward_items enable row level security;
alter table public.love_reward_redemptions enable row level security;
alter table public.love_wishes enable row level security;
alter table public.love_letters enable row level security;

create policy reward_items_read on public.love_reward_items for select to authenticated
using(public.love_is_member() and (available or public.love_is_owner()));
create policy reward_redemptions_read on public.love_reward_redemptions for select to authenticated
using(customer_id=auth.uid() or public.love_is_owner());
create policy wishes_read on public.love_wishes for select to authenticated
using(public.love_is_member());
-- No direct SELECT on love_letters even for members; unlock gate in RPC is the only way to get the body.

revoke all on public.love_reward_items,public.love_reward_redemptions,public.love_wishes,public.love_letters from anon;
revoke all on public.love_reward_items,public.love_reward_redemptions,public.love_wishes,public.love_letters from authenticated;
grant select on public.love_reward_items,public.love_reward_redemptions,public.love_wishes to authenticated;

create or replace function public.love_save_reward(
 p_id uuid,p_name text,p_category text,p_price integer,p_emoji text,
 p_description text,p_stock integer,p_available boolean,p_position integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare out_id uuid;
begin
 if not public.love_is_owner() then raise exception 'Only owner may manage rewards'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 1 and 60 or p_price not between 1 and 100000
  or (p_stock is not null and p_stock<0) then raise exception 'Invalid product'; end if;
 if p_id is null then
   insert into public.love_reward_items(name,category,price,emoji,description,stock,available,position)
   values(trim(p_name),left(coalesce(p_category,'甜蜜福利'),30),p_price,
     left(coalesce(p_emoji,'🎁'),12),left(coalesce(p_description,''),280),p_stock,coalesce(p_available,true),coalesce(p_position,0))
   returning id into out_id;
 else
   update public.love_reward_items set name=trim(p_name),category=left(coalesce(p_category,'甜蜜福利'),30),
     price=p_price,emoji=left(coalesce(p_emoji,'🎁'),12),description=left(coalesce(p_description,''),280),
     stock=p_stock,available=coalesce(p_available,true),position=coalesce(p_position,0)
   where id=p_id returning id into out_id;
   if out_id is null then raise exception 'Product not found'; end if;
 end if;
 return out_id;
end $$;

create or replace function public.love_delete_reward(p_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception 'Only owner may delete rewards'; end if;
 delete from public.love_reward_items where id=p_id;
end $$;

create or replace function public.love_redeem_reward(p_id uuid,p_note text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 product public.love_reward_items%rowtype;
 current_balance integer;
 redeem_id uuid;
begin
 if not public.love_is_customer() then raise exception 'Only wife may redeem rewards'; end if;
 if p_request_id is null then raise exception 'Missing request ID'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select id into redeem_id from public.love_reward_redemptions where request_id=p_request_id and customer_id=auth.uid();
 if redeem_id is not null then return redeem_id; end if;
 if exists(select 1 from public.love_reward_redemptions where request_id=p_request_id) then
   raise exception 'Request ID already used'; end if;
 select * into product from public.love_reward_items where id=p_id and available for update;
 if not found then raise exception '商品已下架'; end if;
 if product.stock is not null and product.stock<=0 then raise exception '商品已售罄'; end if;
 update public.love_wallets set balance=balance-product.price,updated_at=now()
 where customer_id=auth.uid() and balance>=product.price
 returning balance into current_balance;
 if not found then raise exception '积分不足'; end if;
 if product.stock is not null then
   update public.love_reward_items set stock=stock-1 where id=product.id;
 end if;
 insert into public.love_reward_redemptions(request_id,customer_id,item_id,item_name,price,note)
 values(p_request_id,auth.uid(),product.id,product.name,product.price,left(coalesce(p_note,''),240))
 returning id into redeem_id;
 insert into public.love_wallet_events(customer_id,source_key,delta,reason)
 values(auth.uid(),'reward:'||redeem_id::text,-product.price,'商城兑换：'||product.name);
 return redeem_id;
end $$;

create or replace function public.love_finish_redemption(p_id uuid,p_refund boolean) returns void
language plpgsql security definer set search_path=''
as $$
declare rec public.love_reward_redemptions%rowtype;
begin
 if not public.love_is_owner() then raise exception 'Only owner may settle rewards'; end if;
 select * into rec from public.love_reward_redemptions where id=p_id for update;
 if not found or rec.status<>'pending' then raise exception '兑换单已处理'; end if;
 if coalesce(p_refund,false) then
   update public.love_reward_redemptions set status='refunded',updated_at=now() where id=rec.id;
   insert into public.love_wallets(customer_id,balance)
     values(rec.customer_id,rec.price)
     on conflict(customer_id) do update set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
   if rec.item_id is not null then
     update public.love_reward_items set stock=stock+1 where id=rec.item_id and stock is not null;
   end if;
   insert into public.love_wallet_events(customer_id,source_key,delta,reason)
     values(rec.customer_id,'reward_refund:'||rec.id::text,rec.price,'商城退款：'||rec.item_name);
 else
   update public.love_reward_redemptions set status='fulfilled',updated_at=now() where id=rec.id;
 end if;
end $$;

create or replace function public.love_create_wish(
 p_title text,p_description text,p_category text,p_desired_date date
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare new_id uuid;
begin
 if not public.love_is_member() then raise exception 'Only couple members may create wishes'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 1 and 90 then raise exception '愿望名称不能为空'; end if;
 insert into public.love_wishes(author_id,title,description,category,desired_date)
 values(auth.uid(),trim(p_title),left(coalesce(p_description,''),500),
 left(coalesce(p_category,'小愿望'),30),p_desired_date) returning id into new_id;
 return new_id;
end $$;

create or replace function public.love_edit_wish(p_id uuid,p_title text,p_description text,p_category text,p_desired_date date)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_member() or char_length(trim(coalesce(p_title,''))) not between 1 and 90 then
   raise exception '无权编辑或愿望名称不正确'; end if;
 update public.love_wishes set title=trim(p_title),description=left(coalesce(p_description,''),500),
   category=left(coalesce(p_category,'小愿望'),30),desired_date=p_desired_date,updated_at=now()
 where id=p_id and author_id=auth.uid() and status='open';
 if not found then raise exception '只有作者可以编辑尚未认领的愿望'; end if;
end $$;

create or replace function public.love_claim_wish(p_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 update public.love_wishes set status='claimed',claimed_by=auth.uid(),updated_at=now()
 where id=p_id and status='open' and author_id<>auth.uid();
 if not found then raise exception '愿望已被认领，或不能认领自己的愿望'; end if;
end $$;

create or replace function public.love_complete_wish(p_id uuid,p_memory_note text) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 update public.love_wishes set status='done',memory_note=left(coalesce(p_memory_note,''),500),
   completed_at=now(),updated_at=now()
 where id=p_id and status='claimed' and author_id=auth.uid();
 if not found then raise exception '请由许愿的人确认愿望已经实现'; end if;
end $$;

create or replace function public.love_delete_wish(p_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 delete from public.love_wishes where id=p_id and author_id=auth.uid() and status='open';
 if not found then raise exception '只有作者可以删除未认领的愿望'; end if;
end $$;

create or replace function public.love_send_letter(p_body text,p_unlock_at timestamptz) returns uuid
language plpgsql security definer set search_path=''
as $$
declare receiver_id uuid; new_id uuid; when_open timestamptz;
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 1 and 1000 then raise exception '留言长度必须为1至1000字'; end if;
 select id into receiver_id from public.love_profiles where id<>auth.uid() limit 1;
 if receiver_id is null then raise exception '另一个账号尚未设置'; end if;
 when_open:=greatest(coalesce(p_unlock_at,now()),now());
 if when_open > now()+interval '366 days' then raise exception '解锁时间不能超过一年'; end if;
 insert into public.love_letters(sender_id,recipient_id,body,unlock_at)
 values(auth.uid(),receiver_id,trim(p_body),when_open) returning id into new_id;
 return new_id;
end $$;

-- Only security-definer RPC may read letters. Delayed recipient letters must not reveal body.
create or replace function public.love_get_letters() returns jsonb
language sql stable security definer set search_path=''
as $$
select coalesce(pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object(
    'id',l.id,'sender_id',l.sender_id,'recipient_id',l.recipient_id,
    'created_at',l.created_at,'unlock_at',l.unlock_at,'read_at',l.read_at,
    'body',case when l.sender_id=auth.uid() or l.unlock_at<=now() then l.body else null end
  ) order by l.created_at desc
),'[]'::jsonb)
from (select * from public.love_letters
  where sender_id=auth.uid() or recipient_id=auth.uid()
  order by created_at desc limit 150) l
where public.love_is_member();
$$;

create or replace function public.love_read_letter(p_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 update public.love_letters set read_at=coalesce(read_at,now())
 where id=p_id and recipient_id=auth.uid() and unlock_at<=now();
 if not found then raise exception '信件尚未解锁或不可阅读'; end if;
end $$;

revoke execute on function
 public.love_save_reward(uuid,text,text,integer,text,text,integer,boolean,integer),
 public.love_delete_reward(uuid),public.love_redeem_reward(uuid,text,uuid),
 public.love_finish_redemption(uuid,boolean),
 public.love_create_wish(text,text,text,date),public.love_edit_wish(uuid,text,text,text,date),
 public.love_claim_wish(uuid),public.love_complete_wish(uuid,text),public.love_delete_wish(uuid),
 public.love_send_letter(text,timestamptz),public.love_get_letters(),public.love_read_letter(uuid)
from public,anon;
grant execute on function
 public.love_save_reward(uuid,text,text,integer,text,text,integer,boolean,integer),
 public.love_delete_reward(uuid),public.love_redeem_reward(uuid,text,uuid),
 public.love_finish_redemption(uuid,boolean),
 public.love_create_wish(text,text,text,date),public.love_edit_wish(uuid,text,text,text,date),
 public.love_claim_wish(uuid),public.love_complete_wish(uuid,text),public.love_delete_wish(uuid),
 public.love_send_letter(text,timestamptz),public.love_get_letters(),public.love_read_letter(uuid)
to authenticated;

do $$
declare tbl text;
begin
 foreach tbl in array array['love_reward_items','love_reward_redemptions','love_wishes'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename=tbl) then
   execute pg_catalog.format('alter publication supabase_realtime add table public.%I',tbl);
  end if;
 end loop;
end $$;

-- Five starter rewards: all editable/removable by the owner. Inventory NULL = unlimited.
insert into public.love_reward_items(name,category,price,emoji,description,stock,position) values
('电影选择权','约会福利',60,'🎬','今晚一起看哪一部电影，由老婆挑选。',null,1),
('老板请喝饮料','吃喝福利',80,'☕','任选一杯日常饮料，老板请客。',null,2),
('免洗碗券','生活特权',100,'🧽','兑换一次免洗碗福利。',null,3),
('专属爱心早餐','吃喝福利',130,'🍳','老板准备一份早餐。',null,4),
('神秘惊喜礼包','惊喜礼物',200,'🎁','由老板安排小小惊喜。',null,5);
