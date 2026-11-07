create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  recipient_role text not null check (recipient_role in ('artisan', 'delivery')),
  created_at timestamptz not null default now(),
  unique (order_id, recipient_role, recipient_id),
  check (customer_id <> recipient_id)
);

create index if not exists conversations_customer_created_idx
  on public.conversations(customer_id, created_at desc);
create index if not exists conversations_recipient_created_idx
  on public.conversations(recipient_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

create or replace function public.is_current_user_in_conversation(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations
    where conversations.id = p_conversation_id
      and (conversations.customer_id = (select auth.uid())
        or conversations.recipient_id = (select auth.uid()))
  );
$$;

revoke all on function public.is_current_user_in_conversation(uuid)
  from public, anon;
grant execute on function public.is_current_user_in_conversation(uuid)
  to authenticated;

drop policy if exists "Conversation participants can read conversations"
  on public.conversations;
create policy "Conversation participants can read conversations"
  on public.conversations for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );

drop policy if exists "Conversation participants can read messages"
  on public.messages;
create policy "Conversation participants can read messages"
  on public.messages for select
  to authenticated
  using (public.is_current_user_in_conversation(conversation_id));

drop policy if exists "Conversation participants can send messages"
  on public.messages;
create policy "Conversation participants can send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_current_user_in_conversation(conversation_id)
    and length(trim(body)) between 1 and 4000
  );

create or replace function public.get_customer_order_contacts()
returns table (
  order_id uuid,
  order_created_at timestamptz,
  recipient_role text,
  recipient_id uuid,
  recipient_name text,
  context_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
begin
  if v_customer_id is null or not exists (
    select 1
    from public.profiles
    where profiles.id = v_customer_id
      and profiles.account_role = 'customer'
  ) then
    raise exception 'Only a signed-in customer can view order contacts';
  end if;

  return query
    select
      orders.id,
      orders.created_at,
      'artisan'::text,
      profiles.id,
      profiles.display_name,
      string_agg(distinct products.name, ', ' order by products.name)
    from public.orders
    join public.order_items
      on order_items.order_id = orders.id
    join public.products
      on products.id = order_items.product_id
    join public.profiles
      on profiles.id = products.owner_id
      and profiles.account_role = 'artisan'
    where orders.customer_id = v_customer_id
    group by orders.id, orders.created_at, profiles.id, profiles.display_name

    union all

    select
      orders.id,
      orders.created_at,
      'delivery'::text,
      profiles.id,
      profiles.display_name,
      'Delivery for order ' || left(orders.id::text, 8)
    from public.orders
    join public.delivery_jobs
      on delivery_jobs.order_id = orders.id
      and delivery_jobs.delivery_id is not null
      and delivery_jobs.status in ('accepted', 'delivered')
    join public.profiles
      on profiles.id = delivery_jobs.delivery_id
      and profiles.account_role = 'delivery'
    where orders.customer_id = v_customer_id
    order by 2 desc, 3, 5;
end;
$$;

create or replace function public.open_order_conversation(
  p_order_id uuid,
  p_recipient_role text,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
  v_customer_name text;
  v_recipient_name text;
  v_conversation_id uuid;
begin
  if v_customer_id is null or p_recipient_role not in ('artisan', 'delivery')
    or not exists (
      select 1
      from public.orders
      where orders.id = p_order_id
        and orders.customer_id = v_customer_id
    )
    or not exists (
      select 1
      from public.profiles
      where profiles.id = v_customer_id
        and profiles.account_role = 'customer'
    )
  then
    raise exception 'This order is not available for messaging';
  end if;

  if p_recipient_role = 'artisan' and not exists (
    select 1
    from public.order_items
    join public.products on products.id = order_items.product_id
    where order_items.order_id = p_order_id
      and products.owner_id = p_recipient_id
  ) then
    raise exception 'This artisan is not associated with the order';
  end if;

  if p_recipient_role = 'delivery' and not exists (
    select 1
    from public.delivery_jobs
    where delivery_jobs.order_id = p_order_id
      and delivery_jobs.delivery_id = p_recipient_id
      and delivery_jobs.status in ('accepted', 'delivered')
  ) then
    raise exception 'This delivery partner is not assigned to the order';
  end if;

  select display_name into v_customer_name
  from public.profiles
  where id = v_customer_id and account_role = 'customer';

  select display_name into v_recipient_name
  from public.profiles
  where id = p_recipient_id and account_role = p_recipient_role;

  if v_customer_name is null or v_recipient_name is null then
    raise exception 'A conversation participant could not be found';
  end if;

  insert into public.conversations (
    order_id,
    customer_id,
    customer_name,
    recipient_id,
    recipient_name,
    recipient_role
  )
  values (
    p_order_id,
    v_customer_id,
    v_customer_name,
    p_recipient_id,
    v_recipient_name,
    p_recipient_role
  )
  on conflict (order_id, recipient_role, recipient_id)
  do update set order_id = excluded.order_id
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke all on function public.get_customer_order_contacts()
  from public, anon;
revoke all on function public.open_order_conversation(uuid, text, uuid)
  from public, anon;
grant execute on function public.get_customer_order_contacts()
  to authenticated;
grant execute on function public.open_order_conversation(uuid, text, uuid)
  to authenticated;

drop policy if exists "Artisans can view order items for their sales"
  on public.order_items;
create policy "Artisans can view order items for their sales"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.products
      where products.id = order_items.product_id
        and products.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Artisans can view orders containing their products"
  on public.orders;
create policy "Artisans can view orders containing their products"
  on public.orders for select
  to authenticated
  using (
    exists (
      select 1
      from public.order_items
      join public.products on products.id = order_items.product_id
      where order_items.order_id = orders.id
        and products.owner_id = (select auth.uid())
    )
  );

create or replace function public.get_artisan_earnings()
returns table (
  gross_sales_cents bigint,
  commission_cents bigint,
  net_earnings_cents bigint,
  orders_count bigint,
  units_sold bigint,
  current_month_cents bigint,
  previous_month_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.account_role = 'artisan'
  ) then
    raise exception 'Only an artisan can view artisan earnings';
  end if;

  return query
    with eligible_sales as (
      select
        order_items.order_id,
        order_items.quantity::bigint as quantity,
        (order_items.unit_price_cents::bigint * order_items.quantity) as amount,
        orders.created_at
      from public.order_items
      join public.orders on orders.id = order_items.order_id
      join public.products on products.id = order_items.product_id
      where products.owner_id = (select auth.uid())
        and (
          orders.status = 'paid'
          or (
            orders.status = 'pending_cod'
            and exists (
              select 1
              from public.delivery_jobs
              where delivery_jobs.order_id = orders.id
                and delivery_jobs.status = 'delivered'
            )
          )
        )
    ),
    totals as (
      select
        coalesce(sum(amount), 0)::bigint as gross,
        count(distinct order_id)::bigint as order_total,
        coalesce(sum(quantity), 0)::bigint as units,
        coalesce(sum(amount) filter (
          where created_at >= date_trunc('month', now())
        ), 0)::bigint as current_month,
        coalesce(sum(amount) filter (
          where created_at >= date_trunc('month', now()) - interval '1 month'
            and created_at < date_trunc('month', now())
        ), 0)::bigint as previous_month
      from eligible_sales
    )
    select
      gross,
      round(gross * 0.05)::bigint,
      gross - round(gross * 0.05)::bigint,
      order_total,
      units,
      current_month,
      previous_month
    from totals;
end;
$$;

create or replace function public.get_artisan_sales_by_product()
returns table (
  product_id bigint,
  product_name text,
  units_sold bigint,
  gross_sales_cents bigint,
  commission_cents bigint,
  net_earnings_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.account_role = 'artisan'
  ) then
    raise exception 'Only an artisan can view product sales';
  end if;

  return query
    with product_totals as (
      select
        products.id,
        products.name,
        coalesce(sum(sales.quantity), 0)::bigint as units,
        coalesce(sum(sales.amount), 0)::bigint as gross
      from public.products
      left join lateral (
        select
          order_items.quantity::bigint as quantity,
          order_items.unit_price_cents::bigint * order_items.quantity as amount
        from public.order_items
        join public.orders on orders.id = order_items.order_id
        where order_items.product_id = products.id
          and (
            orders.status = 'paid'
            or (
              orders.status = 'pending_cod'
              and exists (
                select 1 from public.delivery_jobs
                where delivery_jobs.order_id = orders.id
                  and delivery_jobs.status = 'delivered'
              )
            )
          )
      ) as sales on true
      where products.owner_id = (select auth.uid())
      group by products.id, products.name
    )
    select
      id,
      name,
      units,
      gross,
      round(gross * 0.05)::bigint,
      gross - round(gross * 0.05)::bigint
    from product_totals
    order by gross desc, name;
end;
$$;

create or replace function public.get_delivery_earnings()
returns table (
  total_earnings_cents bigint,
  deliveries_completed bigint,
  current_month_cents bigint,
  previous_month_cents bigint,
  active_deliveries bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.account_role = 'delivery'
  ) then
    raise exception 'Only a delivery partner can view delivery earnings';
  end if;

  return query
    select
      (count(*) filter (where delivery_jobs.status = 'delivered') * 550)::bigint,
      count(*) filter (where delivery_jobs.status = 'delivered')::bigint,
      (count(*) filter (
        where delivery_jobs.status = 'delivered'
          and delivery_jobs.delivered_at >= date_trunc('month', now())
      ) * 550)::bigint,
      (count(*) filter (
        where delivery_jobs.status = 'delivered'
          and delivery_jobs.delivered_at >= date_trunc('month', now()) - interval '1 month'
          and delivery_jobs.delivered_at < date_trunc('month', now())
      ) * 550)::bigint,
      count(*) filter (where delivery_jobs.status = 'accepted')::bigint
    from public.delivery_jobs
    where delivery_jobs.delivery_id = (select auth.uid());
end;
$$;

revoke all on function public.get_artisan_earnings()
  from public, anon;
revoke all on function public.get_artisan_sales_by_product()
  from public, anon;
revoke all on function public.get_delivery_earnings()
  from public, anon;
grant execute on function public.get_artisan_earnings()
  to authenticated;
grant execute on function public.get_artisan_sales_by_product()
  to authenticated;
grant execute on function public.get_delivery_earnings()
  to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
