-- 《恋爱营业中》· 每个愿望最多关联一张私密照片
-- 私有 Storage Bucket：只允许夫妻两个已绑定账号读取，许愿人写入/更换/删除。
alter table public.love_wishes
add column if not exists photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('love-wish-photos','love-wish-photos',false,2097152,array['image/jpeg']::text[])
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Folder pattern: <author_uuid>/<wish_uuid>/<photo_uuid>.jpg
create policy "love wish photo couple read"
on storage.objects for select to authenticated
using (
  bucket_id='love-wish-photos' and public.love_is_member()
);

create policy "love wish photo author insert"
on storage.objects for insert to authenticated
with check (
 bucket_id='love-wish-photos'
 and public.love_is_member()
 and pg_catalog.split_part(name,'/',1)=auth.uid()::text
 and pg_catalog.split_part(name,'/',2) ~ '^[a-f0-9-]{36}$'
 and pg_catalog.split_part(name,'/',3) ~ '^[a-f0-9-]{36}\.jpg$'
 and pg_catalog.split_part(name,'/',4)=''
 and exists (
   select 1 from public.love_wishes w
   where w.id::text=pg_catalog.split_part(name,'/',2)
   and w.author_id=auth.uid()
 )
);

create policy "love wish photo author delete"
on storage.objects for delete to authenticated
using (
 bucket_id='love-wish-photos'
 and public.love_is_member()
 and pg_catalog.split_part(name,'/',1)=auth.uid()::text
 and exists (
   select 1 from public.love_wishes w
   where w.id::text=pg_catalog.split_part(name,'/',2)
     and w.author_id=auth.uid()
 )
);

-- Author may attach/re-attach only a real uploaded private image,
-- or set NULL to unlink; status can be open / claimed / done.
create or replace function public.love_set_wish_photo(p_id uuid,p_photo_path text)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  prefix text := auth.uid()::text||'/'||p_id::text||'/';
begin
 if not public.love_is_member() then raise exception 'Not signed in'; end if;
 if not exists (
   select 1 from public.love_wishes w where w.id=p_id and w.author_id=auth.uid()
 ) then raise exception '只有许愿的人才能修改照片'; end if;
 if p_photo_path is not null then
   if p_photo_path not like (prefix||'%')
     or char_length(p_photo_path)<>char_length(prefix)+40
     or pg_catalog.right(p_photo_path,4)<>'.jpg'
     or pg_catalog.substr(p_photo_path,char_length(prefix)+1,36)
         !~ '^[a-f0-9-]{36}$'
   then raise exception 'Invalid photo path'; end if;
   if not exists(select 1 from storage.objects o
      where o.bucket_id='love-wish-photos' and o.name=p_photo_path)
   then raise exception 'Uploaded photo not found'; end if;
 end if;
 update public.love_wishes set photo_path=p_photo_path,updated_at=now()
 where id=p_id and author_id=auth.uid();
end $$;

revoke execute on function public.love_set_wish_photo(uuid,text) from public,anon;
grant execute on function public.love_set_wish_photo(uuid,text) to authenticated;
