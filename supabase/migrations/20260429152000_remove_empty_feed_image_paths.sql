-- WithU feed image cleanup.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- Removes image paths from posts when the Storage object exists but has 0 bytes.
-- Those files cannot render in the app and show as gray boxes.

create or replace view public.feed_empty_image_files as
select
  p.id as post_id,
  path.name as image_path,
  coalesce(nullif(o.metadata->>'size', '')::bigint, 0) as size_bytes,
  o.metadata,
  p.created_at
from public.posts p
cross join lateral unnest(
  case
    when coalesce(array_length(p.image_paths, 1), 0) > 0 then p.image_paths
    when p.image_path is not null then array[p.image_path]
    else '{}'::text[]
  end
) as path(name)
left join storage.objects o
  on o.bucket_id = 'post-images'
 and o.name = path.name
where o.id is null
   or coalesce(nullif(o.metadata->>'size', '')::bigint, 0) = 0
order by p.created_at desc;

with cleaned as (
  select
    p.id,
    array(
      select path.name
      from unnest(
        case
          when coalesce(array_length(p.image_paths, 1), 0) > 0 then p.image_paths
          when p.image_path is not null then array[p.image_path]
          else '{}'::text[]
        end
      ) as path(name)
      join storage.objects o
        on o.bucket_id = 'post-images'
       and o.name = path.name
      where coalesce(nullif(o.metadata->>'size', '')::bigint, 0) > 0
    ) as good_paths
  from public.posts p
  where p.image_path is not null
     or coalesce(array_length(p.image_paths, 1), 0) > 0
)
update public.posts p
set
  image_paths = cleaned.good_paths,
  image_path = cleaned.good_paths[1],
  image_status = case
    when coalesce(array_length(cleaned.good_paths, 1), 0) > 0 then p.image_status
    else 'none'
  end,
  updated_at = now()
from cleaned
where p.id = cleaned.id
  and (
    coalesce(p.image_paths, '{}'::text[]) is distinct from cleaned.good_paths
    or p.image_path is distinct from cleaned.good_paths[1]
  );

grant select on public.feed_empty_image_files to authenticated;
