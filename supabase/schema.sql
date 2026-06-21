-- T N Krishnaiah Setty & Son bookstore backend schema for Supabase.
-- Run this in the Supabase SQL editor or as a migration before enabling the app
-- to use Supabase-backed products and orders.

-- Required for gen_random_uuid().
create extension if not exists "pgcrypto";

-- Reusable timestamp trigger for rows with an updated_at column.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Product/category taxonomy.
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Store catalog. The category text field preserves the current frontend label,
-- while category_id gives us a relational link for future category pages.
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
  price numeric(10,2) not null default 0,
  mrp numeric(10,2),
  stock_status text default 'in_stock',
  stock_quantity integer default 0,
  cover_style text,
  cover_image_url text,
  gallery_images text[],
  image_alt text,
  rating numeric(2,1) default 0,
  review_count integer default 0,
  is_featured boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint products_price_non_negative check (price >= 0),
  constraint products_mrp_non_negative check (mrp is null or mrp >= 0),
  constraint products_stock_quantity_non_negative check (stock_quantity >= 0),
  constraint products_rating_range check (rating >= 0 and rating <= 5)
);

-- Customer order header. Payment capture is not implemented yet; this stores
-- order requests created by checkout or WhatsApp confirmation flows.
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
  subtotal numeric(10,2) not null default 0,
  shipping_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null,
  payment_status text default 'pending',
  order_status text default 'pending',
  whatsapp_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint orders_amounts_non_negative check (
    subtotal >= 0 and shipping_fee >= 0 and discount >= 0 and total >= 0
  )
);

-- Order line items use snapshots so past orders stay readable even if product
-- titles, prices, or SKUs change later.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title_snapshot text not null,
  sku_snapshot text,
  price_snapshot numeric(10,2) not null default 0,
  quantity integer not null default 1,
  line_total numeric(10,2) not null default 0,
  created_at timestamptz default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_amounts_non_negative check (price_snapshot >= 0 and line_total >= 0)
);

-- Reviews are public only after approval.
create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  customer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  review_text text,
  is_approved boolean default false,
  created_at timestamptz default now()
);

-- Future discounts/coupon support. Payments are not implemented yet.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10,2) not null,
  min_order_amount numeric(10,2) default 0,
  max_discount numeric(10,2),
  is_active boolean default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  constraint coupons_discount_value_non_negative check (discount_value >= 0),
  constraint coupons_min_order_non_negative check (min_order_amount >= 0),
  constraint coupons_max_discount_non_negative check (max_discount is null or max_discount >= 0)
);

-- Keep updated_at fresh for editable tables.
drop trigger if exists update_categories_updated_at on public.categories;
create trigger update_categories_updated_at
before update on public.categories
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_products_updated_at on public.products;
create trigger update_products_updated_at
before update on public.products
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_orders_updated_at on public.orders;
create trigger update_orders_updated_at
before update on public.orders
for each row
execute function public.update_updated_at_column();

-- Lookup indexes for catalog browsing, admin filtering, and order support.
create index if not exists idx_categories_slug on public.categories(slug);
create index if not exists idx_categories_is_active on public.categories(is_active);

create index if not exists idx_products_slug on public.products(slug);
create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_is_active on public.products(is_active);
create index if not exists idx_products_is_featured on public.products(is_featured);
create index if not exists idx_products_stock_status on public.products(stock_status);
create index if not exists idx_products_language on public.products(language);
create index if not exists idx_products_sku on public.products(sku);

create index if not exists idx_orders_order_number on public.orders(order_number);
create index if not exists idx_orders_customer_phone on public.orders(customer_phone);
create index if not exists idx_orders_order_status on public.orders(order_status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_created_at on public.orders(created_at);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);

create index if not exists idx_customer_reviews_product_id on public.customer_reviews(product_id);

create index if not exists idx_coupons_code on public.coupons(code);

-- Row Level Security.
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.customer_reviews enable row level security;
alter table public.coupons enable row level security;

-- API grants. RLS policies below still decide which rows are visible/writable.
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.customer_reviews to anon, authenticated;
grant insert on public.orders, public.order_items to anon, authenticated;
grant all on public.categories, public.products, public.orders, public.order_items, public.customer_reviews, public.coupons to authenticated;
revoke select, update, delete on public.orders from anon;
revoke select, update, delete on public.order_items from anon;

-- Recreate policies so this file can be safely re-run during early setup.
drop policy if exists "Public can read active categories" on public.categories;
drop policy if exists "Authenticated users can manage categories" on public.categories;

drop policy if exists "Public can read active products" on public.products;
drop policy if exists "Authenticated users can manage products" on public.products;

drop policy if exists "Anyone can create orders" on public.orders;
drop policy if exists "Authenticated users can manage orders" on public.orders;

drop policy if exists "Anyone can create order items" on public.order_items;
drop policy if exists "Authenticated users can manage order items" on public.order_items;

drop policy if exists "Public can read approved reviews" on public.customer_reviews;
drop policy if exists "Authenticated users can manage reviews" on public.customer_reviews;

drop policy if exists "Authenticated users can manage coupons" on public.coupons;

-- Public storefront reads.
create policy "Public can read active categories"
on public.categories
for select
to anon, authenticated
using (is_active = true);

create policy "Public can read active products"
on public.products
for select
to anon, authenticated
using (is_active = true);

create policy "Public can read approved reviews"
on public.customer_reviews
for select
to anon, authenticated
using (is_approved = true);

-- Customer order creation.
create policy "Anyone can create orders"
on public.orders
for insert
to anon, authenticated
with check (
  id is not null
  and order_number ~ '^TNK-[0-9]{4}-[A-Za-z0-9-]+$'
  and length(trim(customer_name)) between 2 and 160
  and length(trim(customer_phone)) between 6 and 32
  and length(trim(delivery_address)) between 5 and 1000
  and length(trim(city)) between 2 and 120
  and length(trim(pincode)) between 4 and 20
  and subtotal >= 0
  and shipping_fee >= 0
  and discount >= 0
  and total >= 0
  and payment_method in ('upi', 'online', 'cod', 'whatsapp')
  and coalesce(order_status, 'pending') = 'pending'
  and coalesce(payment_status, 'pending') = 'pending'
);

-- Anonymous checkout creates the order first and then inserts line items with
-- that order_id. The customer still cannot read, update, or delete order rows.
create policy "Anyone can create order items"
on public.order_items
for insert
to anon, authenticated
with check (
  order_id is not null
  and length(trim(title_snapshot)) between 1 and 300
  and quantity > 0
  and quantity <= 999
  and price_snapshot >= 0
  and line_total >= 0
);

-- Temporary admin policies.
-- IMPORTANT: This treats any authenticated Supabase user as an admin for now.
-- Replace with real admin-role checks once an admin profile/role table exists.
create policy "Authenticated users can manage categories"
on public.categories
for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage products"
on public.products
for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage orders"
on public.orders
for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage order items"
on public.order_items
for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage reviews"
on public.customer_reviews
for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage coupons"
on public.coupons
for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- Seed categories used by the current starter catalog and filters.
insert into public.categories (name, slug, description, sort_order, is_active)
values
  ('Architecture / Spiritual', 'architecture-spiritual', 'Vastu, architecture, and spiritually aligned living.', 10, true),
  ('Astrology', 'astrology', 'Jyotishya, panchanga, muhurta, and astrology references.', 20, true),
  ('Biography / Spiritual Inspiration', 'biography-spiritual-inspiration', 'Lives and teachings of saints and spiritual leaders.', 30, true),
  ('Bhagavadgita', 'bhagavadgita', 'Bhagavad Gita editions, translations, and commentaries.', 40, true),
  ('Children / Folklore', 'children-folklore', 'Children''s stories, folklore, and family reading.', 50, true),
  ('Childrens Story', 'childrens-story', 'Story books for children and young readers.', 60, true),
  ('Cooking', 'cooking', 'Traditional cooking and household reference books.', 70, true),
  ('Devotional', 'devotional', 'Devotional books, prayer guides, and spiritual reading.', 80, true),
  ('Educational', 'educational', 'Learning and educational reference titles.', 90, true),
  ('General', 'general', 'General interest spiritual and cultural books.', 100, true),
  ('Health', 'health', 'Health, yoga, and wellness books.', 110, true),
  ('Homa / Vaidika', 'homa-vaidika', 'Vedic chanting, homa, and ritual texts.', 120, true),
  ('Literature & Fiction', 'literature-fiction', 'Epics, stories, and literary editions.', 130, true),
  ('Parihaara', 'parihaara', 'Remedial and parihaara texts.', 140, true),
  ('Personality', 'personality', 'Personality and self-development titles.', 150, true),
  ('Personality Development', 'personality-development', 'Practical guidance for personal development.', 160, true),
  ('Phala Jyotishya', 'phala-jyotishya', 'Predictive astrology and jyotishya references.', 170, true),
  ('Phalita', 'phalita', 'Astrological results and interpretation texts.', 180, true),
  ('Pooja', 'pooja', 'Pooja books and daily worship guidance.', 190, true),
  ('Pooja Vidhana', 'pooja-vidhana', 'Pooja methods, mantras, and ritual procedures.', 200, true),
  ('Purana / Story', 'purana-story', 'Purana, itihasa, and devotional story editions.', 210, true),
  ('Religion & Spirituality', 'religion-spirituality', 'Scripture, philosophy, and spiritual study.', 220, true),
  ('Ritual Practices', 'ritual-practices', 'Traditional ritual practice guides.', 230, true),
  ('Spiritual / Occult', 'spiritual-occult', 'Spiritual, mantra, tantra, and occult references.', 240, true),
  ('Story', 'story', 'Story books and narrative religious literature.', 250, true),
  ('Story / Songs / Music', 'story-songs-music', 'Stories, songs, and devotional music books.', 260, true),
  ('Stotra', 'stotra', 'Stotra, sahasranama, and daily chanting books.', 270, true),
  ('Stotra / Sahasranama', 'stotra-sahasranama', 'Sahasranama and stotra editions with meanings.', 280, true),
  ('Vrata', 'vrata', 'Vrata books, festival practices, and observances.', 290, true),
  ('Yantra Mantra Tantra', 'yantra-mantra-tantra', 'Yantra, mantra, tantra, and sadhana references.', 300, true),
  ('Yoga', 'yoga', 'Yoga and pranayama practice guides.', 310, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Seed products from src/data/demoProducts.js.
insert into public.products (
  slug,
  title,
  subtitle,
  short_description,
  description,
  category_id,
  category,
  author,
  publisher,
  language,
  book_type,
  isbn,
  sku,
  pages,
  badge,
  tags,
  price,
  mrp,
  stock_status,
  stock_quantity,
  cover_style,
  cover_image_url,
  gallery_images,
  image_alt,
  rating,
  review_count,
  is_featured,
  is_active
)
values
  (
    'gita-kannada',
    'Srimad Bhagavad Gita',
    'Kannada translation with meaning',
    'Kannada translation with meaning',
    'Srimad Bhagavad Gita Kannada edition with meaning for devotional study and daily reading.',
    (select id from public.categories where slug = 'devotional'),
    'Devotional',
    'Maharshi Vyasa',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-GITA-250',
    'TNK-GITA-250',
    416,
    'Best Seller',
    array['Devotional', 'Religion & Spirituality', 'Bhagavadgita']::text[],
    250.00,
    360.00,
    'in_stock',
    25,
    'cover-saffron',
    '/product-images/gita-kannada-cover.svg',
    array['/product-images/gita-kannada-cover.svg']::text[],
    'Srimad Bhagavad Gita Kannada edition book cover',
    4.9,
    1248,
    true,
    true
  ),
  (
    'vishnu-sahasranama',
    'Vishnu Sahasranama',
    'Commentary and meaning',
    'Commentary and meaning',
    'Vishnu Sahasranama edition with commentary and meaning for daily chanting and study.',
    (select id from public.categories where slug = 'stotra'),
    'Stotra',
    'Adi Shankaracharya',
    'Gita Press Gorakhpur',
    'Sanskrit / Kannada',
    'Paperback',
    'TNK-VISHNU-180',
    'TNK-VISHNU-180',
    224,
    'Top Rated',
    array['Stotra', 'Religion & Spirituality', 'Stotra / Sahasranama']::text[],
    180.00,
    260.00,
    'in_stock',
    18,
    'cover-maroon',
    '/product-images/vishnu-sahasranama-cover.svg',
    array['/product-images/vishnu-sahasranama-cover.svg']::text[],
    'Vishnu Sahasranama commentary and meaning book cover',
    4.8,
    892,
    true,
    true
  ),
  (
    'rudram-chamakam',
    'Rudram Chamakam',
    'Sanskrit text with Kannada meaning',
    'Sanskrit text with Kannada meaning',
    'Rudram Chamakam Sanskrit text with Kannada meaning for chanting, pooja, and vaidika reference.',
    (select id from public.categories where slug = 'homa-vaidika'),
    'Homa / Vaidika',
    'Traditional Vedic Text',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-RUDRAM-160',
    'TNK-RUDRAM-160',
    168,
    'Pooja Essential',
    array['Homa / Vaidika', 'Stotra', 'Pooja Vidhana']::text[],
    160.00,
    220.00,
    'in_stock',
    20,
    'cover-palm',
    '/product-images/rudram-chamakam-cover.svg',
    array['/product-images/rudram-chamakam-cover.svg', '/product-images/rudram-chamakam-page.svg']::text[],
    'Rudram Chamakam Sanskrit text with Kannada meaning book cover',
    4.7,
    645,
    true,
    true
  ),
  (
    'hanuman-chalisa',
    'Hanuman Chalisa',
    'Pocket edition for daily prayer',
    'Pocket edition for daily prayer',
    'Pocket Hanuman Chalisa edition for daily prayer and travel-friendly chanting.',
    (select id from public.categories where slug = 'stotra'),
    'Stotra',
    'Goswami Tulsidas',
    'Gita Press Gorakhpur',
    'Hindi',
    'Paperback',
    'GPG-HC-60',
    'GPG-HC-60',
    64,
    'Pocket Book',
    array['Stotra', 'Devotional', 'Religion & Spirituality']::text[],
    60.00,
    90.00,
    'in_stock',
    40,
    'cover-red',
    null,
    array[]::text[],
    null,
    4.9,
    2135,
    true,
    true
  ),
  (
    'pooja-vidhana',
    'Pooja Vidhana Deepika',
    'Home pooja procedures and mantras',
    'Home pooja procedures and mantras',
    'Pooja Vidhana Deepika with home pooja procedures, mantras, and vrata guidance.',
    (select id from public.categories where slug = 'pooja-vidhana'),
    'Pooja Vidhana',
    'T N K Editorial Team',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-POOJA-220',
    'TNK-POOJA-220',
    280,
    'New Arrival',
    array['Pooja Vidhana', 'Pooja', 'Ritual Practices', 'Vrata']::text[],
    220.00,
    320.00,
    'in_stock',
    22,
    'cover-gold',
    null,
    array[]::text[],
    null,
    4.8,
    748,
    false,
    true
  ),
  (
    'lal-kitab',
    'Lal Kitab',
    'Complete guide',
    'Complete guide',
    'Lal Kitab complete guide for phala jyotishya and astrology reference.',
    (select id from public.categories where slug = 'phala-jyotishya'),
    'Phala Jyotishya',
    'Traditional Jyotishya Reference',
    'P and P Publishers',
    'Hindi',
    'Paperback',
    'PP-LALKITAB-280',
    'PP-LALKITAB-280',
    352,
    'Astrology',
    array['Astrology', 'Phala Jyotishya', 'Phalita']::text[],
    280.00,
    400.00,
    'low_stock',
    5,
    'cover-parchment',
    null,
    array[]::text[],
    null,
    4.5,
    524,
    false,
    true
  ),
  (
    'ramayana',
    'Valmiki Ramayana',
    'Illustrated devotional edition',
    'Illustrated devotional edition',
    'Valmiki Ramayana illustrated devotional edition for family reading and spiritual study.',
    (select id from public.categories where slug = 'purana-story'),
    'Purana / Story',
    'Maharshi Valmiki',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-RAMA-340',
    'TNK-RAMA-340',
    520,
    'Family Reading',
    array['Purana / Story', 'Devotional', 'Religion & Spirituality', 'Story']::text[],
    340.00,
    480.00,
    'in_stock',
    12,
    'cover-blue',
    null,
    array[]::text[],
    null,
    4.9,
    1105,
    true,
    true
  ),
  (
    'mahabharatha',
    'Mahabharatha',
    'Complete story edition',
    'Complete story edition',
    'Mahabharatha complete story edition for readers of itihasa, purana, and literature.',
    (select id from public.categories where slug = 'literature-fiction'),
    'Literature & Fiction',
    'Maharshi Vyasa',
    'Chinmaya Prakashana',
    'English',
    'Paperback',
    'CP-MAHA-420',
    'CP-MAHA-420',
    640,
    'Classic',
    array['Literature & Fiction', 'Purana / Story', 'Story']::text[],
    420.00,
    600.00,
    'in_stock',
    10,
    'cover-indigo',
    null,
    array[]::text[],
    null,
    4.7,
    698,
    false,
    true
  ),
  (
    'devi-mahatme',
    'Devi Mahatme',
    'Shakti worship text',
    'Shakti worship text',
    'Devi Mahatme text for Shakti worship, devotional reading, and festival practice.',
    (select id from public.categories where slug = 'devotional'),
    'Devotional',
    'Traditional Sanskrit Text',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-DEVI-190',
    'TNK-DEVI-190',
    192,
    'Festival Pick',
    array['Devotional', 'Religion & Spirituality', 'Spiritual / Occult']::text[],
    190.00,
    270.00,
    'in_stock',
    16,
    'cover-crimson',
    null,
    array[]::text[],
    null,
    4.8,
    431,
    false,
    true
  ),
  (
    'yoga-pranayama',
    'Yoga Pranayama',
    'Daily practice guide',
    'Daily practice guide',
    'Yoga Pranayama daily practice guide for wellness, breathing, and spiritual discipline.',
    (select id from public.categories where slug = 'health'),
    'Health',
    'Traditional Yoga Notes',
    'Agni Prakashana',
    'Kannada',
    'Paperback',
    'AGNI-YOGA-150',
    'AGNI-YOGA-150',
    144,
    'Wellness',
    array['Health', 'Yoga', 'Personality Development']::text[],
    150.00,
    210.00,
    'in_stock',
    14,
    'cover-green',
    null,
    array[]::text[],
    null,
    4.6,
    352,
    false,
    true
  ),
  (
    'vastu-shastra',
    'Vastu Shastra Sarvaswa',
    'Architecture and spiritual alignment',
    'Architecture and spiritual alignment',
    'Vastu Shastra Sarvaswa reference for architecture, spiritual alignment, and traditional planning.',
    (select id from public.categories where slug = 'architecture-spiritual'),
    'Architecture / Spiritual',
    'Vastu Vidwan R. Shastri',
    'Eshwari Prakash',
    'English',
    'Paperback',
    'EP-VASTU-260',
    'EP-VASTU-260',
    256,
    'Reference',
    array['Architecture / Spiritual', 'Spiritual / Occult', 'General']::text[],
    260.00,
    390.00,
    'in_stock',
    8,
    'cover-brown',
    null,
    array[]::text[],
    null,
    4.5,
    288,
    false,
    true
  ),
  (
    'panchanga-2026',
    'Panchanga 2026',
    'Calendar, festivals, and muhurta',
    'Calendar, festivals, and muhurta',
    'Panchanga 2026 with calendar, festivals, muhurta, and astrology reference details.',
    (select id from public.categories where slug = 'astrology'),
    'Astrology',
    'T N K Editorial Team',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-PANCHANGA-2026',
    'TNK-PANCHANGA-2026',
    128,
    'Seasonal',
    array['Astrology', 'Phala Jyotishya', 'Pooja Vidhana']::text[],
    120.00,
    180.00,
    'in_stock',
    30,
    'cover-yellow',
    null,
    array[]::text[],
    null,
    4.7,
    574,
    false,
    true
  )
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  short_description = excluded.short_description,
  description = excluded.description,
  category_id = excluded.category_id,
  category = excluded.category,
  author = excluded.author,
  publisher = excluded.publisher,
  language = excluded.language,
  book_type = excluded.book_type,
  isbn = excluded.isbn,
  sku = excluded.sku,
  pages = excluded.pages,
  badge = excluded.badge,
  tags = excluded.tags,
  price = excluded.price,
  mrp = excluded.mrp,
  stock_status = excluded.stock_status,
  stock_quantity = excluded.stock_quantity,
  cover_style = excluded.cover_style,
  cover_image_url = excluded.cover_image_url,
  gallery_images = excluded.gallery_images,
  image_alt = excluded.image_alt,
  rating = excluded.rating,
  review_count = excluded.review_count,
  is_featured = excluded.is_featured,
  is_active = excluded.is_active,
  updated_at = now();
