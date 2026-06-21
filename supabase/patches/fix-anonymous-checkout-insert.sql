-- Fix anonymous checkout inserts without exposing private order reads.
-- Run this after supabase/schema.sql if anonymous checkout still receives RLS errors.

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

grant usage on schema public to anon, authenticated;
grant insert on public.orders, public.order_items to anon, authenticated;
grant all on public.orders, public.order_items to authenticated;

revoke select, update, delete on public.orders from anon;
revoke select, update, delete on public.order_items from anon;

drop policy if exists "Anyone can create orders" on public.orders;
drop policy if exists "Anyone can create order items" on public.order_items;
drop policy if exists "Authenticated users can manage orders" on public.orders;
drop policy if exists "Authenticated users can manage order items" on public.order_items;

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
