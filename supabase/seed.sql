-- DEVELOPMENT-ONLY demo data.
--
-- The Supabase CLI loads this file only after a local `supabase db reset`.
-- Never apply this file to a recovered or production database. Inserts use
-- ON CONFLICT DO NOTHING so this seed never overwrites existing catalog rows.

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
on conflict (slug) do nothing;

insert into public.products (
  slug,
  title,
  subtitle,
  description,
  category_id,
  category,
  author,
  publisher,
  language,
  book_type,
  sku,
  price,
  mrp,
  stock_status,
  stock_quantity,
  is_featured,
  is_active
)
values
  (
    'gita-kannada',
    'Srimad Bhagavad Gita',
    'Kannada translation with meaning',
    'Development-only sample catalog record.',
    (select id from public.categories where slug = 'bhagavadgita'),
    'Bhagavadgita',
    'Maharshi Vyasa',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-GITA-250',
    250,
    360,
    'in_stock',
    25,
    true,
    true
  ),
  (
    'ramayana',
    'Valmiki Ramayana',
    'Illustrated devotional edition',
    'Development-only sample catalog record.',
    (select id from public.categories where slug = 'ramayana'),
    'Ramayana',
    'Maharshi Valmiki',
    'T N K Publications',
    'Kannada',
    'Paperback',
    'TNK-RAMA-340',
    340,
    480,
    'in_stock',
    12,
    true,
    true
  ),
  (
    'vastu-shastra',
    'Vastu Shastra Sarvaswa',
    'Architecture and spiritual alignment',
    'Development-only sample catalog record.',
    (select id from public.categories where slug = 'vastu'),
    'Vastu',
    'Vastu Vidwan R. Shastri',
    'Eshwari Prakash',
    'English',
    'Paperback',
    'EP-VASTU-260',
    260,
    390,
    'in_stock',
    8,
    false,
    true
  )
on conflict (slug) do nothing;
