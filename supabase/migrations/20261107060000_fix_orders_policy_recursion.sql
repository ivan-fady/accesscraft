create or replace function public.artisan_can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.account_role = 'artisan'
  )
  and exists (
    select 1
    from public.order_items
    join public.products on products.id = order_items.product_id
    where order_items.order_id = p_order_id
      and products.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.artisan_can_view_order(uuid)
  from public, anon;
grant execute on function public.artisan_can_view_order(uuid)
  to authenticated, service_role;

drop policy if exists "Artisans can view orders containing their products"
  on public.orders;
create policy "Artisans can view orders containing their products"
  on public.orders for select
  to authenticated
  using (public.artisan_can_view_order(id));
