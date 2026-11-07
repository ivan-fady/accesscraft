alter table public.orders
  alter column stripe_session_id drop not null,
  add column if not exists payment_method text not null default 'card';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.orders drop constraint %I',
      constraint_name
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_status_check'
  ) then
    alter table public.orders
      add constraint orders_status_check
      check (status in ('paid', 'needs_review', 'pending_cod'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_method_check'
  ) then
    alter table public.orders
      add constraint orders_payment_method_check
      check (payment_method in ('card', 'cash_on_delivery'));
  end if;
end;
$$;

create or replace function public.place_cash_on_delivery_order(
  p_customer_id uuid,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_quantity integer;
  v_amount_total_cents bigint := 550;
begin
  if p_customer_id is distinct from (select auth.uid())
    or p_customer_email is distinct from (select auth.jwt() ->> 'email')
    or p_customer_email is null or length(p_customer_email) > 254
    or p_customer_name is null or length(trim(p_customer_name)) not between 2 and 100
    or p_customer_phone is null or length(trim(p_customer_phone)) not between 5 and 40
    or jsonb_typeof(p_shipping_address) is distinct from 'object'
    or length(trim(coalesce(p_shipping_address ->> 'line1', ''))) not between 3 and 200
    or length(trim(coalesce(p_shipping_address ->> 'city', ''))) not between 2 and 100
    or length(trim(coalesce(p_shipping_address ->> 'country', ''))) not between 2 and 100
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 20
    or not exists (
      select 1
      from public.profiles
      where profiles.id = p_customer_id
        and profiles.account_role = 'customer'
    )
  then
    raise exception 'Invalid cash-on-delivery order data';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by (value ->> 'product_id')::bigint
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item ->> 'product_id', '') !~ '^[1-9][0-9]*$'
      or coalesce(v_item ->> 'quantity', '') !~ '^[1-9][0-9]*$'
    then
      raise exception 'Invalid cash-on-delivery order item';
    end if;

    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity > 10 then
      raise exception 'Invalid cash-on-delivery order quantity';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found or v_product.status <> 'published'
      or v_product.stock_count < v_quantity
    then
      raise exception 'An item is no longer available in that quantity';
    end if;

    v_amount_total_cents :=
      v_amount_total_cents + v_product.price_cents::bigint * v_quantity;
    if v_amount_total_cents > 2147483647 then
      raise exception 'Order total is too large';
    end if;
  end loop;

  insert into public.orders (
    customer_id,
    customer_email,
    customer_name,
    customer_phone,
    amount_total_cents,
    currency,
    shipping_address,
    status,
    payment_method
  )
  values (
    p_customer_id,
    p_customer_email,
    trim(p_customer_name),
    trim(p_customer_phone),
    v_amount_total_cents::integer,
    'usd',
    p_shipping_address,
    'pending_cod',
    'cash_on_delivery'
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by (value ->> 'product_id')::bigint
  loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;

    select * into v_product
    from public.products
    where id = v_product_id;

    update public.products
    set stock_count = stock_count - v_quantity
    where id = v_product_id;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price_cents,
      quantity
    )
    values (
      v_order_id,
      v_product_id,
      v_product.name,
      v_product.price_cents,
      v_quantity
    );
  end loop;

  insert into public.delivery_jobs (order_id)
  values (v_order_id);

  return v_order_id;
end;
$$;

revoke all on function public.place_cash_on_delivery_order(
  uuid, text, text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.place_cash_on_delivery_order(
  uuid, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.is_customer_for_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders
    where orders.id = p_order_id
      and orders.customer_id = (select auth.uid())
  );
$$;

create or replace function public.delivery_can_view_order(p_order_id uuid)
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
      and profiles.account_role = 'delivery'
  )
  and exists (
    select 1
    from public.delivery_jobs
    where delivery_jobs.order_id = p_order_id
      and (
        delivery_jobs.status = 'pending'
        or delivery_jobs.delivery_id = (select auth.uid())
      )
  );
$$;

revoke all on function public.is_customer_for_order(uuid)
  from public, anon;
revoke all on function public.delivery_can_view_order(uuid)
  from public, anon;
grant execute on function public.is_customer_for_order(uuid)
  to authenticated, service_role;
grant execute on function public.delivery_can_view_order(uuid)
  to authenticated, service_role;

drop policy if exists "Customers can view delivery status for their orders"
  on public.delivery_jobs;
create policy "Customers can view delivery status for their orders"
  on public.delivery_jobs for select
  to authenticated
  using (public.is_customer_for_order(order_id));

drop policy if exists "Delivery partners can view customer details for available jobs"
  on public.orders;
create policy "Delivery partners can view customer details for available jobs"
  on public.orders for select
  to authenticated
  using (public.delivery_can_view_order(id));
