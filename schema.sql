-- ============================================================================
-- Odlarnörden – databasschema
--
-- GENERERAD UR DEN LEVANDE DATABASEN 2026-08-15 (projekt rciaqovopajrkdtuhkdo).
-- Skriv inte om den här filen för hand när du ändrar databasen – då driver den
-- isär igen. Gör ändringen i databasen och generera om filen därifrån.
--
-- Sanningskällan är Supabase: tabellerna, `pg_policies`, `pg_get_functiondef`
-- och migrationshistoriken (17 migrationer, från `initial_schema` 2026-05-29 till
-- `startpaket_stang_admin_user_ids` 2026-08-15). Den här filen är en läsbar kopia
-- för repot – och en väg tillbaka om projektet någon gång försvinner.
--
-- Ordningen nedan spelar roll: funktionerna måste finnas före policyerna som
-- anropar dem, och tomato_varieties före tabellerna som pekar på den.
--
-- TÄCKS INTE av den här filen:
--   * Edge Function `bjud-in` (inbjudningsmejlen) – deployas separat.
--   * Auth-inställningar (Site URL, Redirect URLs, avstängd e-postbekräftelse) –
--     de klickas i Supabase-konsolen och går inte att nå via SQL.
--   * Innehållet (sorter, plantor, skördar, recept) – ligger i Exportera-ZIP:en.
-- ============================================================================


-- ---------------------------------------------------------------- TABELLER --

-- Allowlist. Bara förgodkända adresser kommer in i appen. RLS är på men helt
-- utan policies, så bara service role och SECURITY DEFINER-funktioner når den.
create table if not exists public.allowed_emails (
  email    text primary key,
  added_at timestamptz default now(),
  is_admin boolean not null default false
);

-- Sortbibliotek. Privat per användare sedan 2026-08-14: created_by äger raden
-- och är den enda som ser den. Nya användare hämtar kopior via startpaketet
-- (se list_starter_varieties / copy_starter_varieties längre ner).
create table if not exists public.tomato_varieties (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  notes            text,                          -- visas bara på bärkort i appen
  created_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  category         text,                          -- Bifftomat, Körsbär, Cocktail, Plommon, Chili, Bär, Gurka ...
  growth_type      text,                          -- Stjälk, Dvärg, Buske, Varierar
  height_min_cm    int,
  height_max_cm    int,
  pruning          text,                          -- kort Skötsel-val
  default_location text,                          -- Kruka, Växthus, Planteringslåda, Friland
  use_tags         text[] default '{}'::text[],   -- Sallad, Söt, Sås ...
  pruning_notes    text,                          -- fritext om beskärning (bärbuskar m.m.)
  flavor           text                           -- smakminne: hur smakade den?
);

-- Plantor per säsong.
-- OBS: variety_id är ON DELETE CASCADE. Raderar man en sort försvinner alla
-- plantor av den – och därmed deras foton. Det är skälet till att biblioteket
-- är privat och att startpaketet ger KOPIOR i stället för delade rader.
create table if not exists public.user_tomatoes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  variety_id   uuid not null references public.tomato_varieties(id) on delete cascade,
  planted_date date,
  location     text,                       -- Kruka, Planteringslåda, Växthus, Friland, Ej placerad
  plant_count  int,
  notes        text,
  created_at   timestamptz default now(),
  season       text default '2026'::text,
  pruned_on    date                        -- senast beskuren
);

create table if not exists public.harvests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  variety_id   uuid references public.tomato_varieties(id) on delete set null,
  harvested_at date not null default current_date,
  weight_g     int,
  notes        text,
  created_at   timestamptz default now()
);

-- Recept. Läsbara för alla inbjudna, ändras bara av ägaren. Appen är sedan
-- 2026-08-02 en ren läsvy – recept läggs in och ändras utanför appen.
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  body        text,
  variety_ids uuid[] default '{}'::uuid[],
  created_at  timestamptz default now(),
  image_url   text                          -- sökväg till bild i repots images/
);

-- Växtnäringslogg, flera datum per plats.
create table if not exists public.feedings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  season     text not null default '2026'::text,
  location   text not null,
  fed_on     date not null,
  notes      text,
  created_at timestamptz default now()
);

-- Foton kopplade till en planta. Filerna ligger i Supabase Storage, inte här.
-- Sökväg i bucketen: {user_id}/{tomato_id}/{uuid}.jpg
create table if not exists public.plant_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  tomato_id  uuid not null references public.user_tomatoes(id) on delete cascade,
  path       text not null,
  caption    text,                          -- finns i tabellen men används inte i UI:t
  created_at timestamptz default now()
);
create index if not exists plant_photos_tomato_id_idx on public.plant_photos using btree (tomato_id);

-- Fristående växthusgalleri – foton utan koppling till en enskild planta.
-- Samma bucket, undermapp: {user_id}/gallery/{uuid}.jpg
create table if not exists public.garden_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  path       text not null,
  caption    text,
  created_at timestamptz default now()
);


-- --------------------------------------------------------------- FUNKTIONER --
-- Alla är SECURITY DEFINER med search_path = '' (tomt), så de kör som ägaren
-- och alla objektnamn måste vara fullt kvalificerade.

-- Grinden. Anropas av VARJE RLS-policy i appen.
create or replace function public.is_allowed()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(auth.jwt() ->> 'email')
  );
$function$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.allowed_emails a
    where lower(a.email) = lower(auth.jwt() ->> 'email') and a.is_admin
  );
$function$;

create or replace function public.list_allowed()
returns table(email text, is_admin boolean, added_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får se inbjudningslistan';
  end if;
  return query
    select a.email, a.is_admin, a.added_at
    from public.allowed_emails a
    order by a.is_admin desc, a.email;
end;
$function$;

create or replace function public.add_allowed(p_email text)
returns text language plpgsql security definer set search_path = ''
as $function$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får bjuda in';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Det där ser inte ut som en e-postadress';
  end if;
  insert into public.allowed_emails (email) values (v_email)
    on conflict (email) do nothing;
  return v_email;
end;
$function$;

create or replace function public.remove_allowed(p_email text)
returns text language plpgsql security definer set search_path = ''
as $function$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Endast administratörer får ta bort inbjudningar';
  end if;
  -- Skydd mot att låsa ut sig själv.
  if v_email = lower(auth.jwt() ->> 'email') then
    raise exception 'Du kan inte ta bort din egen åtkomst';
  end if;
  delete from public.allowed_emails where lower(email) = v_email;
  return v_email;
end;
$function$;

-- OBS: raderar INTE filerna i Storage. Supabase blockerar `delete from
-- storage.objects` inne i en definer-funktion ("Direct deletion from storage
-- tables is not allowed") och hela raderingen fallerar då transaktionellt.
-- Appen måste ta bort filerna med storage.remove(paths) FÖRE det här anropet.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_uid is null then
    raise exception 'Inte inloggad';
  end if;

  delete from public.plant_photos     where user_id = v_uid;
  delete from public.garden_photos    where user_id = v_uid;
  delete from public.harvests         where user_id = v_uid;
  delete from public.feedings         where user_id = v_uid;
  delete from public.recipes          where user_id = v_uid;
  delete from public.user_tomatoes    where user_id = v_uid;
  delete from public.tomato_varieties where created_by = v_uid;
  delete from public.allowed_emails   where lower(email) = v_email;
  delete from auth.users              where id = v_uid;
end;
$function$;

-- ---- Startpaket: hämta färdiga sorter (2026-08-15) ----
-- Hjälpfunktion. Anropas bara inifrån de två nedan – se revoken längst ner.
create or replace function public.admin_user_ids()
returns table(id uuid)
language sql stable security definer set search_path = ''
as $function$
  select u.id
  from auth.users u
  join public.allowed_emails a on lower(a.email) = lower(u.email)
  where a.is_admin;
$function$;

-- Förlagor = admins sorter. `redan_i_biblioteket` flaggar namn man redan har,
-- så appen kan visa "Har redan" i stället för att skapa dubbletter.
create or replace function public.list_starter_varieties()
returns table(
  id uuid, name text, category text, growth_type text,
  height_min_cm int, height_max_cm int, pruning text,
  default_location text, use_tags text[], pruning_notes text,
  redan_i_biblioteket boolean
)
language sql stable security definer set search_path = ''
as $function$
  select v.id, v.name, v.category, v.growth_type,
         v.height_min_cm, v.height_max_cm, v.pruning,
         v.default_location, v.use_tags, v.pruning_notes,
         exists (
           select 1 from public.tomato_varieties egen
           where egen.created_by = auth.uid()
             and lower(egen.name) = lower(v.name)
         )
  from public.tomato_varieties v
  where public.is_allowed()
    and v.created_by is not null
    and v.created_by <> auth.uid()
    -- Aliaset behövs: funktionens egen utdatakolumn heter också id.
    and v.created_by in (select au.id from public.admin_user_ids() au)
  order by v.name;
$function$;

-- Returnerar antalet skapade sorter. flavor och notes kopieras medvetet INTE –
-- de är personliga minnen. Dubbletter hoppas tyst över, så det är ofarligt att
-- trycka två gånger.
create or replace function public.copy_starter_varieties(p_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  antal integer;
begin
  if not public.is_allowed() then
    raise exception 'Kontot har inte behörighet till appen.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  -- distinct on (lower(name)) skyddar mot att två förlagor med samma namn
  -- båda slinker igenom not exists-kontrollen i samma sats.
  insert into public.tomato_varieties
    (name, category, growth_type, height_min_cm, height_max_cm,
     pruning, default_location, use_tags, pruning_notes, created_by)
  select distinct on (lower(v.name))
         v.name, v.category, v.growth_type, v.height_min_cm, v.height_max_cm,
         v.pruning, v.default_location, v.use_tags, v.pruning_notes, auth.uid()
  from public.tomato_varieties v
  where v.id = any(p_ids)
    and v.created_by is not null
    and v.created_by <> auth.uid()
    and v.created_by in (select au.id from public.admin_user_ids() au)
    and not exists (
      select 1 from public.tomato_varieties egen
      where egen.created_by = auth.uid()
        and lower(egen.name) = lower(v.name)
    )
  order by lower(v.name), v.name;

  get diagnostics antal = row_count;
  return antal;
end;
$function$;


-- ------------------------------------------------------ RÄTTIGHETER (RPC) --
-- Ingen av funktionerna ska gå att anropa utloggad.
--
-- FÄLLA: Supabase har `alter default privileges ... grant execute on functions
-- to anon, authenticated, service_role`. Det ger varje ny funktion i public en
-- DIREKT grant till de rollerna. En `revoke ... from public` tar bara bort
-- PUBLIC-grantet – rollen måste namnges. Kontrollera med:
--   select has_function_privilege('authenticated', 'public.f()', 'EXECUTE');
revoke execute on function public.is_allowed()                    from anon, public;
revoke execute on function public.is_admin()                      from anon, public;
revoke execute on function public.list_allowed()                  from anon, public;
revoke execute on function public.add_allowed(text)               from anon, public;
revoke execute on function public.remove_allowed(text)            from anon, public;
revoke execute on function public.delete_my_account()             from anon, public;
revoke execute on function public.list_starter_varieties()        from anon, public;
revoke execute on function public.copy_starter_varieties(uuid[])  from anon, public;
revoke execute on function public.admin_user_ids()                from anon, public;

grant execute on function public.is_allowed()                   to authenticated;
grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.list_allowed()                 to authenticated;
grant execute on function public.add_allowed(text)              to authenticated;
grant execute on function public.remove_allowed(text)           to authenticated;
grant execute on function public.delete_my_account()            to authenticated;
grant execute on function public.list_starter_varieties()       to authenticated;
grant execute on function public.copy_starter_varieties(uuid[]) to authenticated;

-- admin_user_ids() är intern och skulle annars lämna ut vilka användar-id som är
-- admin. De två funktionerna som anropar den är definer och kör som ägaren, så
-- de påverkas inte av den här revoken (verifierat 2026-08-15).
revoke execute on function public.admin_user_ids() from authenticated;


-- ---------------------------------------------------------- RLS + POLICIES --
-- Varje policy kräver public.is_allowed(). allowed_emails har RLS på men noll
-- policies – det är avsiktligt, tabellen ska bara nås av definer-funktionerna.
alter table public.allowed_emails   enable row level security;
alter table public.tomato_varieties enable row level security;
alter table public.user_tomatoes    enable row level security;
alter table public.harvests         enable row level security;
alter table public.recipes          enable row level security;
alter table public.feedings         enable row level security;
alter table public.plant_photos     enable row level security;
alter table public.garden_photos    enable row level security;

-- Sorter: privat bibliotek. SELECT kräver ägarskap sedan 2026-08-14.
create policy "Users see own varieties"    on public.tomato_varieties for select to public          using (auth.uid() = created_by and public.is_allowed());
create policy "Auth can insert varieties"  on public.tomato_varieties for insert to authenticated   with check (auth.uid() = created_by and public.is_allowed());
create policy "Owner can update varieties" on public.tomato_varieties for update to authenticated   using (auth.uid() = created_by and public.is_allowed());
create policy "Owner can delete varieties" on public.tomato_varieties for delete to authenticated   using (auth.uid() = created_by and public.is_allowed());

-- Odling: privat per användare.
create policy "Users see own tomatoes"   on public.user_tomatoes for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own tomatoes" on public.user_tomatoes for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own tomatoes" on public.user_tomatoes for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own tomatoes" on public.user_tomatoes for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Skörd: privat per användare.
create policy "Users see own harvests"   on public.harvests for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own harvests" on public.harvests for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own harvests" on public.harvests for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own harvests" on public.harvests for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Recept: GEMENSAMMA att läsa, ägaren ändrar. Åt andra hållet mot sorterna.
create policy "All allowed can read recipes" on public.recipes for select to public        using (public.is_allowed());
create policy "Users insert own recipes"     on public.recipes for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own recipes"     on public.recipes for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own recipes"     on public.recipes for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Växtnäring: privat per användare.
create policy "Users see own feedings"   on public.feedings for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own feedings" on public.feedings for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own feedings" on public.feedings for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own feedings" on public.feedings for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Plantfoton: privat per användare.
create policy "Users see own plant photos"   on public.plant_photos for select to public using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own plant photos" on public.plant_photos for insert to public with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own plant photos" on public.plant_photos for update to public using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own plant photos" on public.plant_photos for delete to public using (auth.uid() = user_id and public.is_allowed());

-- Galleri: privat per användare.
create policy "Users see own garden photos"   on public.garden_photos for select to public using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own garden photos" on public.garden_photos for insert to public with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own garden photos" on public.garden_photos for update to public using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own garden photos" on public.garden_photos for delete to public using (auth.uid() = user_id and public.is_allowed());


-- ------------------------------------------------------------------ STORAGE --
-- Privat bucket för alla foton (både plantfoton och galleriet). 3 MB per fil.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 3145728,
        array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;

-- Första mappnivån i sökvägen måste vara användarens eget id. Det är det som
-- skiljer användarna åt i lagringen: {user_id}/{tomato_id}/... och
-- {user_id}/gallery/...
create policy "plant-photos select own" on storage.objects for select to public
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_allowed());
create policy "plant-photos insert own" on storage.objects for insert to public
  with check (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_allowed());
create policy "plant-photos update own" on storage.objects for update to public
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_allowed());
create policy "plant-photos delete own" on storage.objects for delete to public
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_allowed());


-- ============================================================================
-- SKAVANKER SOM FINNS I DATABASEN IDAG
-- Nedtecknade för att filen ska spegla verkligheten, inte en snyggare version
-- av den. Inget av det är trasigt just nu – men det är sådant som biter senare.
--
-- 1. is_allowed() jämför `email = lower(jwt-adressen)` utan att gemenera den
--    LAGRADE adressen, till skillnad från is_admin() som gemenerar båda. Det
--    fungerar bara för att add_allowed() normaliserar vid insert. En adress som
--    lagts in för hand med versaler skulle tyst sakna åtkomst.
--
-- 2. Policy-rollerna är inkonsekventa: vissa är `to authenticated`, andra
--    `to public` (dvs. även anon). Det är inget hål – anon har ingen auth.uid()
--    och faller på villkoret ändå – men mönstret ser slarvigt ut vid granskning.
--
-- 3. plant_photos.user_id, garden_photos.user_id och tomato_varieties.created_by
--    saknar ON DELETE CASCADE mot auth.users, till skillnad från de övriga
--    tabellerna. delete_my_account() städar dem explicit, men raderas en
--    användare direkt i Supabase-konsolen fallerar det på främmande nyckel.
-- ============================================================================
