-- =====================================================================
-- Hajji Restaurant: database schema (Supabase / PostgreSQL)
-- Run this file once in the Supabase SQL editor, then run seed.sql.
-- =====================================================================

-- ---------- Admins ----------
-- A user is an admin only if their auth user id is listed here.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ---------- Menu ----------
create table if not exists public.sections (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.products (
  id text primary key,
  section_id text not null references public.sections(id) on update cascade,
  name text not null,
  description text,
  image_url text,
  -- Simple products have a base price. Products with sizes leave it null
  -- and get their prices from product_options.
  base_price int check (base_price is null or base_price > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_options (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  label text not null,
  price int not null check (price > 0),
  sort_order int not null default 0,
  is_active boolean not null default true
);

create index if not exists products_section_idx on public.products(section_id, sort_order);
create index if not exists options_product_idx on public.product_options(product_id, sort_order);

-- ---------- Orders ----------
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  customer_name text not null,
  phone text not null,
  address text not null,
  notes text,
  total_iqd int not null check (total_iqd >= 0),
  payment text not null default 'cash_on_delivery' check (payment in ('cash_on_delivery')),
  status text not null default 'new' check (status in ('new', 'preparing', 'delivered', 'cancelled'))
);

-- Snapshot of name and price at order time, so old invoices never change.
create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  option_id text references public.product_options(id),
  product_name text not null,
  option_label text,
  unit_price int not null check (unit_price > 0),
  qty int not null check (qty between 1 and 50),
  line_total int not null check (line_total > 0)
);

create index if not exists order_items_order_idx on public.order_items(order_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.admins enable row level security;
alter table public.sections enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- admins table: only admins can read it (nobody can write it from the API).
drop policy if exists "admins read own" on public.admins;
create policy "admins read own" on public.admins
  for select using (user_id = auth.uid());

-- Public can read only active menu rows. Admins can do everything.
drop policy if exists "public read active sections" on public.sections;
create policy "public read active sections" on public.sections
  for select using (is_active);
drop policy if exists "admin manage sections" on public.sections;
create policy "admin manage sections" on public.sections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read active products" on public.products;
create policy "public read active products" on public.products
  for select using (is_active);
drop policy if exists "admin manage products" on public.products;
create policy "admin manage products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read active options" on public.product_options;
create policy "public read active options" on public.product_options
  for select using (is_active);
drop policy if exists "admin manage options" on public.product_options;
create policy "admin manage options" on public.product_options
  for all using (public.is_admin()) with check (public.is_admin());

-- Orders: no direct access for the public. They are created only through create_order().
drop policy if exists "admin read orders" on public.orders;
create policy "admin read orders" on public.orders
  for select using (public.is_admin());
drop policy if exists "admin update orders" on public.orders;
create policy "admin update orders" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin read order items" on public.order_items;
create policy "admin read order items" on public.order_items
  for select using (public.is_admin());

-- =====================================================================
-- create_order: the ONLY way a customer places an order.
-- The browser sends product ids, option ids and quantities only.
-- Prices are read here from the database; any price sent by the browser is ignored.
-- The whole function runs in one transaction: any error cancels the order.
-- =====================================================================
create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text,
  p_items jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_total int := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_option public.product_options%rowtype;
  v_qty int;
  v_unit int;
  v_label text;
  v_option_id text;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 or char_length(trim(p_customer_name)) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if p_phone is null or trim(p_phone) !~ '^\+?[0-9 ]{7,20}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if p_address is null or char_length(trim(p_address)) < 5 or char_length(trim(p_address)) > 300 then
    raise exception 'INVALID_ADDRESS';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_ITEMS';
  end if;

  insert into public.orders (customer_name, phone, address, notes, total_iqd)
  values (trim(p_customer_name), trim(p_phone), trim(p_address), left(trim(coalesce(p_notes, '')), 500), 0)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item->'qty') <> 'number' then
      raise exception 'INVALID_QTY';
    end if;
    v_qty := (v_item->>'qty')::numeric::int;
    if v_qty < 1 or v_qty > 50 or (v_item->>'qty')::numeric <> v_qty then
      raise exception 'INVALID_QTY';
    end if;

    select * into v_product from public.products
      where id = v_item->>'product_id' and is_active;
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    v_option_id := nullif(v_item->>'option_id', '');
    if v_option_id is null then
      if v_product.base_price is null then
        raise exception 'OPTION_REQUIRED';
      end if;
      v_unit := v_product.base_price;
      v_label := null;
    else
      select * into v_option from public.product_options
        where id = v_option_id and product_id = v_product.id and is_active;
      if not found then
        raise exception 'OPTION_UNAVAILABLE';
      end if;
      v_unit := v_option.price;
      v_label := v_option.label;
    end if;

    insert into public.order_items
      (order_id, product_id, option_id, product_name, option_label, unit_price, qty, line_total)
    values
      (v_order_id, v_product.id, v_option_id, v_product.name, v_label, v_unit, v_qty, v_unit * v_qty);

    v_total := v_total + v_unit * v_qty;
  end loop;

  update public.orders set total_iqd = v_total where id = v_order_id;

  return json_build_object('order_id', v_order_id, 'total_iqd', v_total);
end;
$$;

revoke all on function public.create_order(text, text, text, text, jsonb) from public;
grant execute on function public.create_order(text, text, text, text, jsonb) to anon, authenticated;

-- Give read access to the public functions/tables the site needs.
grant usage on schema public to anon, authenticated;
grant select on public.sections, public.products, public.product_options to anon, authenticated;
grant insert, update, delete on public.sections, public.products, public.product_options to authenticated;
grant select, update on public.orders, public.order_items to authenticated;
grant select on public.admins to authenticated;

-- =====================================================================
-- To make yourself an admin after you create your user in
-- Supabase Authentication > Users, run (replace the email):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;
-- =====================================================================
