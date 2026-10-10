-- LEGACY PRE-MIGRATION PATCH — retain for audit history; do not run as part of
-- Phase 2A recovery. Development taxonomy now lives in supabase/seed.sql.
--
-- Client-approved storefront taxonomy.
-- Safe to rerun. This patch never deletes products or categories.

begin;

insert into public.categories (name, slug, description, sort_order, is_active)
values
  ('Bhagavadgita', 'bhagavadgita', 'Bhagavad Gita editions, translations, and commentaries.', 10, true),
  ('Ramayana', 'ramayana', 'Ramayana editions, translations, and related literature.', 20, true),
  ('Mahabharata', 'mahabharata', 'Mahabharata editions, translations, and related literature.', 30, true),
  ('Puranas', 'puranas', 'Puranas and related traditional literature.', 40, true),
  ('Sahasranamas', 'sahasranamas', 'Sahasranama texts for chanting and study.', 50, true),
  ('Stotras', 'stotras', 'Stotra editions for prayer and daily practice.', 60, true),
  ('Pooja Vidhana', 'pooja-vidhana', 'Pooja methods, mantras, and ritual procedures.', 70, true),
  ('Vratha Vidhana', 'vratha-vidhana', 'Vratha observances, procedures, and festival practices.', 80, true),
  ('Story Books', 'story-books', 'Traditional, cultural, and family story books.', 90, true),
  ('Yogasana Books', 'yogasana-books', 'Yogasana, pranayama, and wellness guides.', 100, true),
  ('Vastu', 'vastu', 'Vastu Shastra and traditional planning references.', 110, true),
  ('Chalisas', 'chalisas', 'Chalisa editions for prayer and chanting.', 120, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Reclassify only known starter records by stable slug. Live/client-added products
-- are deliberately untouched so custom catalog work is preserved.
with starter_category_map(product_slug, category_slug) as (
  values
    ('gita-kannada', 'bhagavadgita'),
    ('vishnu-sahasranama', 'sahasranamas'),
    ('rudram-chamakam', 'stotras'),
    ('hanuman-chalisa', 'chalisas'),
    ('pooja-vidhana', 'pooja-vidhana'),
    ('lal-kitab', 'puranas'),
    ('ramayana', 'ramayana'),
    ('mahabharatha', 'mahabharata'),
    ('devi-mahatme', 'puranas'),
    ('yoga-pranayama', 'yogasana-books'),
    ('vastu-shastra', 'vastu'),
    ('panchanga-2026', 'puranas')
)
update public.products as product
set
  category_id = category.id,
  category = category.name,
  tags = array[category.name]::text[],
  updated_at = now()
from starter_category_map as mapping
join public.categories as category on category.slug = mapping.category_slug
where product.slug = mapping.product_slug;

-- Retire legacy categories only when no product still references them. This
-- preserves both products and any client-created category relationships.
update public.categories as category
set is_active = false, updated_at = now()
where category.slug not in (
  'bhagavadgita',
  'ramayana',
  'mahabharata',
  'puranas',
  'sahasranamas',
  'stotras',
  'pooja-vidhana',
  'vratha-vidhana',
  'story-books',
  'yogasana-books',
  'vastu',
  'chalisas'
)
and not exists (
  select 1
  from public.products as product
  where product.category_id = category.id
);

commit;

-- Verification queries (read-only):
select name, slug, sort_order, is_active
from public.categories
where slug in (
  'bhagavadgita', 'ramayana', 'mahabharata', 'puranas',
  'sahasranamas', 'stotras', 'pooja-vidhana', 'vratha-vidhana',
  'story-books', 'yogasana-books', 'vastu', 'chalisas'
)
order by sort_order;

select slug, title, category
from public.products
where slug in (
  'gita-kannada', 'vishnu-sahasranama', 'rudram-chamakam',
  'hanuman-chalisa', 'pooja-vidhana', 'ramayana', 'mahabharatha',
  'devi-mahatme', 'yoga-pranayama', 'vastu-shastra'
)
order by slug;
