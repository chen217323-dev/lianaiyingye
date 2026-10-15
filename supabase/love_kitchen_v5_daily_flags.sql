-- Make today's recommendation and sold-out status expire at Korean midnight.
alter table public.love_dishes add column daily_tag_date date;

create or replace function public.love_kitchen_mark_dish(p_id uuid,p_featured boolean,p_sold_out boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.love_is_owner() then raise exception '只有老公可以设置推荐与售罄'; end if;
 update public.love_dishes set featured_today=p_featured,sold_out_today=p_sold_out,daily_tag_date=(now() at time zone 'Asia/Seoul')::date
 where id=p_id and approval_status='approved';
 if not found then raise exception '仅已批准的菜可设置供应状态'; end if;
end $$;


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
 where id=p_dish_id and available=true and approval_status='approved' and (not sold_out_today or daily_tag_date is distinct from (now() at time zone 'Asia/Seoul')::date) for share;
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

