-- 372 12th board tracker. Close the database to the anon key.
--
-- Not a migration on purpose. A push applies migrations straight to
-- production, and this would break the live site if it ran before the site
-- is going through the Cloudflare Pages proxy. Run it by hand in the
-- Supabase SQL Editor once these are all true (README.md, "Logins"):
--   1. Cloudflare Access protects the site.
--   2. The Pages environment variables are set and the site works with
--      USE_PROXY: true in config.js.
-- After this, the anon key in config.js opens nothing. The site and the
-- /mute page reach the data with the service key, behind Access or behind a
-- mute token. The email function already uses the service key.
--
-- Safe to run more than once.

do $$
declare t text;
begin
  -- Every table in public keeps row level security on, with no policy for
  -- anon or authenticated, so only the service key gets through.
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "open access" on %I', t);
  end loop;

  -- Uploads go through the proxy now. The bucket stays public, so picture
  -- addresses keep working.
  if to_regclass('storage.objects') is not null then
    drop policy if exists "fixture images add" on storage.objects;
    drop policy if exists "fixture images read" on storage.objects;
  end if;
end $$;

-- To undo, for example to go back to the site without the proxy:
--
-- do $$
-- declare t text;
-- begin
--   for t in select tablename from pg_tables where schemaname = 'public'
--            and tablename not in ('account_secrets', 'notifications_sent') loop
--     execute format('drop policy if exists "open access" on %I', t);
--     execute format('create policy "open access" on %I for all to anon, authenticated using (true) with check (true)', t);
--   end loop;
-- end $$;
