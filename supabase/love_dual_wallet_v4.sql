-- 双人积分经济 V4: 老板做饭赚积分、双方商城兑换、完成愿望双方各+30
-- Backwards-compatible: preserves all pre-existing point balances, menu, orders, and history.

-- 店主也拥有自己的钱包；不改变老婆的余额。
insert into public.love_wallets(customer_id,balance)
select id,0 from public.love_profiles where role='owner'
on conflict(customer_id) do nothing;

-- 商品可仅对老婆、仅对老板或双方出售。原有商品现在双方都能兑换。
alter table public.love_reward_items
add column audience text not null default 'both' check(audience in ('owner','customer','both'));
update public.love_reward_items set audience='both';

-- 订单完成才结算给老板；同一订单完成最多一次。
create or replace function public.love_advance_order(p_order_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
declare
 o public.love_orders%rowtype;
 boss uuid;
begin
 if not public.love_is_owner() then raise exception 'Only owner can update orders'; end if;
 select * into o from public.love_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status='pending' then
   update public.love_orders set status='preparing',updated_at=now() where id=o.id;
 elsif o.status='preparing' then
   select id into boss from public.love_profiles where role='owner';
   if boss is null then raise exception 'Owner missing'; end if;
   update public.love_orders set status='completed',updated_at=now() where id=o.id;
   insert into public.love_wallets(customer_id,balance)
   values(boss,o.price)
   on conflict(customer_id) do update set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
   insert into public.love_wallet_events(customer_id,source_key,delta,reason)
   values(boss,'cooked:'||o.id::text,o.price,'完成做饭收入：'||o.dish_name);
 else raise exception 'Order already closed';
 end if;
end $$;

-- 愿望完成时一次性给许愿者和实现者各+30。不能重复完成。
create or replace function public.love_complete_wish(p_id uuid,p_memory_note text) returns void
language plpgsql security definer set search_path=''
as $$
declare wish public.love_wishes%rowtype;
 reward_user uuid;
 label text;
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 select * into wish from public.love_wishes where id=p_id for update;
 if not found or wish.status<>'claimed' or wish.author_id<>auth.uid() then
   raise exception '仅许愿人能确认未完成的愿望'; end if;
 if wish.claimed_by is null or wish.claimed_by=wish.author_id then
   raise exception '愿望需要由另一方认领'; end if;
 update public.love_wishes
 set status='done',memory_note=left(coalesce(p_memory_note,''),500),
 completed_at=now(),updated_at=now() where id=wish.id;
 for reward_user,label in
 select wish.author_id,'愿望完成 · 许愿奖励：'::text
 union all select wish.claimed_by,'愿望完成 · 实现奖励：'::text
 loop
   insert into public.love_wallets(customer_id,balance)
   values(reward_user,30)
   on conflict(customer_id) do update set balance=public.love_wallets.balance+excluded.balance,updated_at=now();
   insert into public.love_wallet_events(customer_id,source_key,delta,reason)
   values(reward_user,'wish:'||wish.id::text||':'||reward_user::text,30,label||wish.title);
 end loop;
end $$;

-- 老板可自定义兑换对象，并保留原有商品管理字段。
drop function if exists public.love_save_reward(uuid,text,text,integer,text,text,integer,boolean,integer);
create function public.love_save_reward(
 p_id uuid,p_name text,p_category text,p_price integer,p_emoji text,
 p_description text,p_stock integer,p_available boolean,p_position integer,p_audience text default 'both'
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare out_id uuid;
begin
 if not public.love_is_owner() then raise exception 'Only owner may manage rewards'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 1 and 60 or p_price not between 1 and 100000
   or (p_stock is not null and p_stock<0)
   or p_audience not in ('owner','customer','both')
 then raise exception 'Invalid product'; end if;
 if p_id is null then
   insert into public.love_reward_items(name,category,price,emoji,description,stock,available,position,audience)
   values(trim(p_name),left(coalesce(p_category,'甜蜜福利'),30),p_price,
   left(coalesce(p_emoji,'🎁'),12),left(coalesce(p_description,''),280),p_stock,coalesce(p_available,true),coalesce(p_position,0),p_audience)
   returning id into out_id;
 else
   update public.love_reward_items set name=trim(p_name),category=left(coalesce(p_category,'甜蜜福利'),30),
   price=p_price,emoji=left(coalesce(p_emoji,'🎁'),12),description=left(coalesce(p_description,''),280),
   stock=p_stock,available=coalesce(p_available,true),position=coalesce(p_position,0),audience=p_audience
   where id=p_id returning id into out_id;
   if out_id is null then raise exception 'Product not found'; end if;
 end if;
 return out_id;
end $$;

-- 两个账号都可兑换，但只能买面向自己或双方的商品。
-- 请求UUID去重；扣分、库存与兑换单在同一数据库事务中完成。
create or replace function public.love_redeem_reward(p_id uuid,p_note text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 product public.love_reward_items%rowtype;
 current_balance integer;
 redeem_id uuid;
 member_role text;
begin
 if not public.love_is_member() then raise exception 'Only members may redeem rewards'; end if;
 select role into member_role from public.love_profiles where id=auth.uid();
 if p_request_id is null then raise exception 'Missing request ID'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select id into redeem_id from public.love_reward_redemptions where request_id=p_request_id and customer_id=auth.uid();
 if redeem_id is not null then return redeem_id; end if;
 if exists(select 1 from public.love_reward_redemptions where request_id=p_request_id) then
   raise exception 'Request ID already used'; end if;
 select * into product from public.love_reward_items where id=p_id and available for update;
 if not found then raise exception '商品已下架'; end if;
 if product.audience<>'both' and product.audience<>member_role then raise exception '该商品不是提供给你的'; end if;
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

-- 双方的商品兑换由另一方确认；自己不能给自己兑奖/退款。
create or replace function public.love_finish_redemption(p_id uuid,p_refund boolean) returns void
language plpgsql security definer set search_path=''
as $$
declare rec public.love_reward_redemptions%rowtype;
begin
 if not public.love_is_member() then raise exception 'Only members may settle rewards'; end if;
 select * into rec from public.love_reward_redemptions where id=p_id for update;
 if not found or rec.status<>'pending' then raise exception '兑换单已处理'; end if;
 if rec.customer_id=auth.uid() then raise exception '不能给自己的兑换订单兑奖或退款'; end if;
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

-- 兑换券双方都可以看：老婆需要看到老板的兑换券并履行。
drop policy if exists reward_redemptions_read on public.love_reward_redemptions;
create policy reward_redemptions_read on public.love_reward_redemptions for select to authenticated
using(public.love_is_member());

revoke execute on function
  public.love_save_reward(uuid,text,text,integer,text,text,integer,boolean,integer,text),
  public.love_redeem_reward(uuid,text,uuid),
  public.love_finish_redemption(uuid,boolean)
from public,anon;
grant execute on function
  public.love_save_reward(uuid,text,text,integer,text,text,integer,boolean,integer,text),
  public.love_redeem_reward(uuid,text,uuid),
  public.love_finish_redemption(uuid,boolean)
to authenticated;
