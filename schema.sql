-- Kör detta i Supabase SQL editor en gång efter att projektet skapats.

create table tomato_varieties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  color text,
  growth_habit text,
  maturity_days int,
  needs_pruning boolean,
  height_cm int,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table user_tomatoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variety_id uuid not null references tomato_varieties(id) on delete cascade,
  planted_date date,
  location text,
  plant_count int,
  notes text,
  created_at timestamptz default now()
);

alter table tomato_varieties enable row level security;
alter table user_tomatoes enable row level security;

create policy "Auth can read varieties"
  on tomato_varieties for select to authenticated using (true);

create policy "Auth can insert varieties"
  on tomato_varieties for insert to authenticated with check (auth.uid() = created_by);

create policy "Owner can update varieties"
  on tomato_varieties for update to authenticated using (auth.uid() = created_by);

create policy "Owner can delete varieties"
  on tomato_varieties for delete to authenticated using (auth.uid() = created_by);

create policy "Users see own tomatoes"
  on user_tomatoes for select to authenticated using (auth.uid() = user_id);

create policy "Users insert own tomatoes"
  on user_tomatoes for insert to authenticated with check (auth.uid() = user_id);

create policy "Users update own tomatoes"
  on user_tomatoes for update to authenticated using (auth.uid() = user_id);

create policy "Users delete own tomatoes"
  on user_tomatoes for delete to authenticated using (auth.uid() = user_id);
