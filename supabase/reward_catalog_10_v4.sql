-- 为现有商城补足10件商品；不修改老公已经自定义的前5件。
-- 可重复执行，不重复插入同名商品。新增商品默认双方可兑。
insert into public.love_reward_items
  (name,category,price,emoji,description,stock,available,position,audience)
select v.name,v.category,v.price,v.emoji,v.description,
       null,true,v.position,'both'
from (values
  ('专属夸夸券','甜蜜互动',20,'💖','兑换后，对方认真夸你三个优点。',6),
  ('电影选择券','约会福利',60,'🍿','兑换后，两个人一起看的电影由兑换人挑选。',7),
  ('奶茶甜品券','吃喝福利',80,'🧋','兑换一杯奶茶或一份小甜品，由另一方准备或请客。',8),
  ('家务代劳券','生活特权',100,'🧹','由另一方帮忙完成一次双方约定的小家务。',9),
  ('周末约会策划券','约会福利',150,'🎡','由另一方安排一次约会，具体时间和预算一起商量。',10)
) as v(name,category,price,emoji,description,position)
where not exists (select 1 from public.love_reward_items i where i.name=v.name)
  and (select count(*) from public.love_reward_items) = 5;
