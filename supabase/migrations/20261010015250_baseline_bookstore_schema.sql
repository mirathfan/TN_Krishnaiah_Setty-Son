-- Phase 2A baseline schema.
--
-- This migration is intentionally data-safe: it creates missing objects but
-- never truncates, deletes, or seeds application data. Development-only demo
-- records live in ../seed.sql and are not part of production migrations.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.update_updated_at_column() from public, anon, authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  short_description text,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  category text,
  author text,
  publisher text,
  language text,
  book_type text,
  isbn text,
  sku text unique,
  pages integer,
  badge text,
  tags text[],
  price numeric(10, 2) not null default 0,
  mrp numeric(10, 2),
  stock_status text default 'in_stock',
  stock_quantity integer not null default 0,
  cover_style text,
  cover_image_url text,
  gallery_images text[],
  image_alt text,
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_price_non_negative check (price >= 0),
  constraint products_mrp_non_negative check (mrp is null or mrp >= 0),
  constraint products_stock_quantity_non_negative check (stock_quantity >= 0),
  constraint products_rating_range check (rating >= 0 and rating <= 5)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_address text not null,
  city text not null,
  state text,
  pincode text not null,
  notes text,
  subtotal numeric(10, 2) not null default 0,
  shipping_fee numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  payment_method text not null,
  payment_status text not null default 'pending',
  order_status text not null default 'pending',
  whatsapp_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_amounts_non_negative check (
    subtotal >= 0 and shipping_fee >= 0 and discount >= 0 and total >= 0
  )
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title_snapshot text not null,
  sku_snapshot text,
  price_snapshot numeric(10, 2) not null default 0,
  quantity integer not null default 1,
  line_total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_amounts_non_negative check (
    price_snapshot >= 0 and line_total >= 0
  )
);

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  customer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  review_text text,
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null,
  min_order_amount numeric(10, 2) not null default 0,
  max_discount numeric(10, 2),
  is_active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint coupons_discount_value_non_negative check (discount_value >= 0),
  constraint coupons_min_order_non_negative check (min_order_amount >= 0),
  constraint coupons_max_discount_non_negative check (
    max_discount is null or max_discount >= 0
  )
);

drop trigger if exists update_categories_updated_at on public.categories;
create trigger update_categories_updated_at
before update on public.categories
for each row execute function public.update_updated_at_column();

drop trigger if exists update_products_updated_at on public.products;
create trigger update_products_updated_at
before update on public.products
for each row execute function public.update_updated_at_column();

drop trigger if exists update_orders_updated_at on public.orders;
create trigger update_orders_updated_at
before update on public.orders
for each row execute function public.update_updated_at_column();

-- Foreign-key and common-filter indexes. Unique constraints already index
-- slugs, SKUs, order numbers, and coupon codes.
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_active_title_idx on public.products(title) where is_active;
create index if not exists products_active_category_idx on public.products(category_id, title) where is_active;
create index if not exists categories_active_sort_idx on public.categories(sort_order, name) where is_active;
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(order_status, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists customer_reviews_product_id_idx on public.customer_reviews(product_id);
create index if not exists customer_reviews_approved_product_idx
  on public.customer_reviews(product_id, created_at desc)
  where is_approved;
