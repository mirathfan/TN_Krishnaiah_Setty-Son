-- Fix Supabase advisor warning 0011_function_search_path_mutable.
-- This patch is safe to rerun and keeps existing triggers intact because the
-- function signature remains public.update_updated_at_column().

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;
