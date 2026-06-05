-- Fullständigt schema för Laras tomater.
-- Kör i Supabase SQL editor. Tabellerna nedan speglar det appen använder
-- (Sorter, Odling, Skörd, Recept). Säkert att köra på nytt projekt;
-- på ett befintligt projekt, kör bara de delar som saknas.

-- ---------- SORTER (delat bibliotek) ----------
create table if not exists tomato_varieties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,                 -- Bifftomat, Körsbär, Cocktail, Plommon, Chili, Mikrodvärg ...
  growth_type text,              -- Stjälk, Dvärg, Buske, Varierar
  height_min_cm int,
  height_max_cm int,
  pruning text,                  -- Tjuvas ej / regelbundet / vid högväxt ...
  default_location text,         -- standardplacering, t.ex. Kruka / Växthus
  use_tags text[] default '{}',  -- användning: Sallad, Söt, Sås ...
  pruning_notes text,            -- fritext om beskärning (t.ex. bärbuskar)
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- ODLING (privata plantor per säsong) ----------
create table if not exists user_tomatoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variety_id uuid not null references tomato_varieties(id) on delete cascade,
  season text not null default '2026',
  location text,                 -- Kruka, Växthus, Uteland, Ej placerad
  plant_count int,
  planted_date date,
  pruned_on date,                -- senast beskuren (relevant för bärbuskar m.m.)
  notes text,
  created_at timestamptz default now()
);

-- ---------- SKÖRD (privat per användare) ----------
create table if not exists harvests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variety_id uuid references tomato_varieties(id) on delete set null,
  harvested_at date not null,
  weight_g int,
  notes text,
  created_at timestamptz default now()
);

-- ---------- RECEPT (privat per användare) ----------
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body text,
  variety_ids uuid[] default '{}',  -- sorter som passar receptet
  image_url text,                   -- ev. omslagsbild (sökväg i repot eller URL)
  created_at timestamptz default now()
);

-- ---------- TOMATNÄRING (logg per plats, privat per användare) ----------
create table if not exists feedings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null default '2026',
  location text not null,          -- plats: Kruka, Växthus, Uteland ...
  fed_on date not null,            -- datum då näring gavs
  notes text,
  created_at timestamptz default now()
);

-- ---------- ALLOWLIST ----------
-- Endast förgodkända e-postadresser får använda appen. Bara service role /
-- SECURITY DEFINER-funktioner kommer åt tabellen (ingen RLS-policy = ingen
-- direktåtkomst för vanliga användare). Lägg till en användare med:
--   insert into allowed_emails (email) values ('namn@example.com');
create table if not exists allowed_emails (
  email text primary key,
  added_at timestamptz default now()
);
alter table allowed_emails enable row level security;

create or replace function public.is_allowed()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(auth.jwt() ->> 'email')
  );
$$;
grant execute on function public.is_allowed() to authenticated, anon;

-- ---------- RLS ----------
-- OBS: alla policies nedan kräver dessutom public.is_allowed() (allowlist).
alter table tomato_varieties enable row level security;
alter table user_tomatoes enable row level security;
alter table harvests enable row level security;
alter table recipes enable row level security;
alter table feedings enable row level security;

-- Sorter: allowlistade inloggade läser; skaparen ändrar/tar bort.
create policy "Auth can read varieties"
  on tomato_varieties for select to authenticated using (public.is_allowed());
create policy "Auth can insert varieties"
  on tomato_varieties for insert to authenticated with check (auth.uid() = created_by and public.is_allowed());
create policy "Owner can update varieties"
  on tomato_varieties for update to authenticated using (auth.uid() = created_by and public.is_allowed());
create policy "Owner can delete varieties"
  on tomato_varieties for delete to authenticated using (auth.uid() = created_by and public.is_allowed());

-- Odling: privat per användare + allowlist.
create policy "Users see own tomatoes"
  on user_tomatoes for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own tomatoes"
  on user_tomatoes for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own tomatoes"
  on user_tomatoes for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own tomatoes"
  on user_tomatoes for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Skörd: privat per användare + allowlist.
create policy "Users see own harvests"
  on harvests for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own harvests"
  on harvests for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own harvests"
  on harvests for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own harvests"
  on harvests for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Recept: privat per användare + allowlist.
create policy "Users see own recipes"
  on recipes for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own recipes"
  on recipes for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own recipes"
  on recipes for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own recipes"
  on recipes for delete to authenticated using (auth.uid() = user_id and public.is_allowed());

-- Växtnäring: privat per användare + allowlist.
create policy "Users see own feedings"
  on feedings for select to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users insert own feedings"
  on feedings for insert to authenticated with check (auth.uid() = user_id and public.is_allowed());
create policy "Users update own feedings"
  on feedings for update to authenticated using (auth.uid() = user_id and public.is_allowed());
create policy "Users delete own feedings"
  on feedings for delete to authenticated using (auth.uid() = user_id and public.is_allowed());
