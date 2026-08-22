create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  design_id text,
  design_name text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'queued', 'printing', 'completed', 'cancelled')),
  material text not null,
  color text,
  infill integer not null check (infill between 0 and 100),
  estimated_hours numeric(8, 2),
  estimated_price numeric(10, 2),
  file_path text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

drop policy if exists "Users can view their own orders" on public.orders;
create policy "Users can view their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own orders" on public.orders;
create policy "Users can create their own orders"
  on public.orders for insert to authenticated
  with check ((select auth.uid()) = user_id);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', false, 52428800, array['model/stl', 'model/obj', 'model/3mf', 'application/octet-stream'])
on conflict (id) do nothing;

drop policy if exists "Users can upload their own models" on storage.objects;
create policy "Users can upload their own models"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'models' and
    (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can read their own models" on storage.objects;
create policy "Users can read their own models"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'models' and
    (storage.foldername(name))[1] = (select auth.uid()::text)
  );
