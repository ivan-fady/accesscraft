alter table public.orders
  add column if not exists customer_phone text;

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'delivered')),
  delivery_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  check (
    (status = 'pending' and delivery_id is null)
    or (status in ('accepted', 'delivered') and delivery_id is not null)
  )
);

create index if not exists delivery_jobs_pending_created_idx
  on public.delivery_jobs(created_at)
  where status = 'pending';

create index if not exists delivery_jobs_delivery_status_idx
  on public.delivery_jobs(delivery_id, status);

alter table public.delivery_jobs enable row level security;

drop policy if exists "Delivery partners can view available and assigned jobs"
  on public.delivery_jobs;
create policy "Delivery partners can view available and assigned jobs"
  on public.delivery_jobs for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'delivery'
    )
    and (status = 'pending' or delivery_id = (select auth.uid()))
  );

drop policy if exists "Customers can view delivery status for their orders"
  on public.delivery_jobs;
create policy "Customers can view delivery status for their orders"
  on public.delivery_jobs for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders
      where orders.id = delivery_jobs.order_id
        and orders.customer_id = (select auth.uid())
    )
  );

drop policy if exists "Delivery partners can view customer details for available jobs"
  on public.orders;
create policy "Delivery partners can view customer details for available jobs"
  on public.orders for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'delivery'
    )
    and exists (
      select 1
      from public.delivery_jobs
      where delivery_jobs.order_id = orders.id
        and (
          delivery_jobs.status = 'pending'
          or delivery_jobs.delivery_id = (select auth.uid())
        )
    )
  );

drop policy if exists "Delivery partners can view items for available jobs"
  on public.order_items;
create policy "Delivery partners can view items for available jobs"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'delivery'
    )
    and exists (
      select 1
      from public.delivery_jobs
      where delivery_jobs.order_id = order_items.order_id
        and (
          delivery_jobs.status = 'pending'
          or delivery_jobs.delivery_id = (select auth.uid())
        )
    )
  );

create or replace function public.accept_delivery_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid := (select auth.uid());
  v_job_id uuid;
begin
  if v_delivery_id is null or not exists (
    select 1
    from public.profiles
    where profiles.id = v_delivery_id
      and profiles.account_role = 'delivery'
  ) then
    raise exception 'Only a signed-in delivery partner can accept a job';
  end if;

  update public.delivery_jobs
  set status = 'accepted',
      delivery_id = v_delivery_id,
      accepted_at = now()
  where id = p_job_id
    and status = 'pending'
    and delivery_id is null
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'This delivery was already accepted or is no longer available';
  end if;

  return v_job_id;
end;
$$;

revoke all on function public.accept_delivery_job(uuid)
  from public, anon;
grant execute on function public.accept_delivery_job(uuid)
  to authenticated;

create or replace function public.complete_delivery_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid := (select auth.uid());
  v_job_id uuid;
begin
  if v_delivery_id is null or not exists (
    select 1
    from public.profiles
    where profiles.id = v_delivery_id
      and profiles.account_role = 'delivery'
  ) then
    raise exception 'Only a signed-in delivery partner can complete a job';
  end if;

  update public.delivery_jobs
  set status = 'delivered',
      delivered_at = now()
  where id = p_job_id
    and status = 'accepted'
    and delivery_id = v_delivery_id
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'This delivery is not assigned to your account';
  end if;

  return v_job_id;
end;
$$;

revoke all on function public.complete_delivery_job(uuid)
  from public, anon;
grant execute on function public.complete_delivery_job(uuid)
  to authenticated;

drop function if exists public.fulfill_paid_order(
  text, uuid, text, text, integer, text, jsonb, jsonb
);

create or replace function public.fulfill_paid_order(
  p_session_id text,
  p_customer_id uuid,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_amount_total_cents integer,
  p_currency text,
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
  v_status text := 'paid';
begin
  if p_session_id is null or length(p_session_id) > 255
    or p_customer_id is null
    or p_customer_email is null or length(p_customer_email) > 254
    or p_customer_name is null or length(p_customer_name) > 100
    or (p_customer_phone is not null and length(p_customer_phone) > 40)
    or p_amount_total_cents is null or p_amount_total_cents <= 0
    or p_currency is distinct from 'usd'
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 20
  then
    raise exception 'Invalid paid order data';
  end if;

  insert into public.orders (
    stripe_session_id,
    customer_id,
    customer_email,
    customer_name,
    customer_phone,
    amount_total_cents,
    currency,
    shipping_address
  )
  values (
    p_session_id,
    p_customer_id,
    p_customer_email,
    p_customer_name,
    p_customer_phone,
    p_amount_total_cents,
    p_currency,
    coalesce(p_shipping_address, '{}'::jsonb)
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id
    from public.orders
    where stripe_session_id = p_session_id;
    return v_order_id;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by (value ->> 'product_id')::bigint
  loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;

    if v_product_id is null or v_quantity is null
      or v_quantity < 1 or v_quantity > 10
    then
      raise exception 'Invalid paid order item';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      v_status := 'needs_review';
    elsif v_product.status <> 'published'
      or v_product.stock_count < v_quantity
    then
      v_status := 'needs_review';
    else
      update public.products
      set stock_count = stock_count - v_quantity
      where id = v_product_id;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price_cents,
      quantity
    )
    values (
      v_order_id,
      case when found then v_product_id else null end,
      left(coalesce(v_item ->> 'product_name', 'Handmade product'), 120),
      (v_item ->> 'unit_price_cents')::integer,
      v_quantity
    );
  end loop;

  update public.orders
  set status = v_status
  where id = v_order_id;

  if v_status = 'paid' then
    insert into public.delivery_jobs (order_id)
    values (v_order_id)
    on conflict (order_id) do nothing;
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.fulfill_paid_order(
  text, uuid, text, text, text, integer, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.fulfill_paid_order(
  text, uuid, text, text, text, integer, text, jsonb, jsonb
) to service_role;

insert into public.delivery_jobs (order_id)
select orders.id
from public.orders
where orders.status = 'paid'
on conflict (order_id) do nothing;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'delivery_jobs'
  ) then
    alter publication supabase_realtime add table public.delivery_jobs;
  end if;
end;
$$;
