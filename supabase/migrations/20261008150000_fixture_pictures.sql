-- 372 12th board tracker. A picture for each fixture.
--
-- The picture is an address in fixtures.image_url. It is either a link to an
-- image elsewhere or a file uploaded from the site into the public Storage
-- bucket created here.

alter table fixtures add column if not exists image_url text;

-- The bucket is public to read and open to anon to add to, the same as the
-- tables, since the site has no per person login. It only takes images, up
-- to 5 MB each. Skipped where there is no storage schema, such as a plain
-- Postgres used to check migrations.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fixture-images', 'fixture-images', true, 5242880,
          array['image/jpeg','image/png','image/webp','image/gif'])
  on conflict (id) do nothing;

  drop policy if exists "fixture images read" on storage.objects;
  create policy "fixture images read" on storage.objects
    for select to anon, authenticated using (bucket_id = 'fixture-images');

  drop policy if exists "fixture images add" on storage.objects;
  create policy "fixture images add" on storage.objects
    for insert to anon, authenticated with check (bucket_id = 'fixture-images');
end $$;
