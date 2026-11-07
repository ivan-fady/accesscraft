do $$
declare
  constraint_name text;
  policy_name text;
  trigger_name text;
begin
  if to_regclass('public.profiles') is not null then
    for trigger_name in
      select triggers.tgname
      from pg_trigger as triggers
      join pg_proc as procedures
        on procedures.oid = triggers.tgfoid
      join pg_namespace as namespaces
        on namespaces.oid = procedures.pronamespace
      where triggers.tgrelid = 'public.profiles'::regclass
        and not triggers.tgisinternal
        and namespaces.nspname = 'public'
        and procedures.proname = 'protect_profile_role'
    loop
      execute format(
        'drop trigger %I on public.profiles',
        trigger_name
      );
    end loop;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'full_name'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'display_name'
    ) then
      alter table public.profiles rename column full_name to display_name;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'account_role'
    ) then
      alter table public.profiles rename column role to account_role;
    end if;

    alter table public.profiles
      add column if not exists display_name text,
      add column if not exists account_role text,
      add column if not exists created_at timestamptz not null default now();

    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%account_role%'
    loop
      execute format(
        'alter table public.profiles drop constraint %I',
        constraint_name
      );
    end loop;

    for policy_name in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and (
          coalesce(qual, '') || ' ' || coalesce(with_check, '')
        ) ilike '%account_role%'
    loop
      execute format(
        'drop policy %I on public.products',
        policy_name
      );
    end loop;

    alter table public.profiles
      alter column account_role drop default,
      alter column account_role type text using account_role::text,
      alter column display_name type text using display_name::text;

    update public.profiles
    set display_name = case
          when length(trim(coalesce(display_name, ''))) < 2 then 'Customer'
          else left(trim(display_name), 100)
        end,
        account_role = case
          when account_role in ('customer', 'delivery', 'artisan')
            then account_role
          else 'customer'
        end;

    alter table public.profiles
      alter column display_name set not null,
      alter column account_role set default 'customer',
      alter column account_role set not null;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and conname = 'profiles_display_name_check'
    ) then
      alter table public.profiles
        add constraint profiles_display_name_check
        check (length(display_name) between 2 and 100);
    end if;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and conname = 'profiles_account_role_check'
    ) then
      alter table public.profiles
        add constraint profiles_account_role_check
        check (account_role in ('customer', 'delivery', 'artisan'));
    end if;
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 2 and 100),
  account_role text not null check (
    account_role in ('customer', 'delivery', 'artisan')
  ),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile"
  on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_name text;
begin
  v_role := coalesce(new.raw_user_meta_data ->> 'account_role', '');
  v_name := nullif(
    left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100),
    ''
  );

  if v_role not in ('customer', 'delivery', 'artisan') then
    raise exception 'Choose a valid AccessCraft account type';
  end if;

  if v_name is null or length(v_name) < 2 then
    raise exception 'Enter your name to create an AccessCraft account';
  end if;

  insert into public.profiles (id, display_name, account_role)
  values (new.id, v_name, v_role);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created
  on auth.users;
drop trigger if exists on_auth_user_created_accesscraft_profile
  on auth.users;
create trigger on_auth_user_created_accesscraft_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id, display_name, account_role)
select
  users.id,
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
      'Customer'
    ),
    100
  ),
  case
    when users.raw_user_meta_data ->> 'account_role'
      in ('customer', 'delivery', 'artisan')
      then users.raw_user_meta_data ->> 'account_role'
    else 'customer'
  end
from auth.users as users
on conflict (id) do nothing;

alter table public.products
  add column if not exists owner_id uuid
  references public.profiles(id) on delete set null;

drop policy if exists "Artisans can view their own products"
  on public.products;
create policy "Artisans can view their own products"
  on public.products for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );

drop policy if exists "Artisans can create their own products"
  on public.products;
create policy "Artisans can create their own products"
  on public.products for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );

drop policy if exists "Artisans can update their own products"
  on public.products;
create policy "Artisans can update their own products"
  on public.products for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );

drop policy if exists "Artisans can delete their own products"
  on public.products;
create policy "Artisans can delete their own products"
  on public.products for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );

alter table public.orders
  add column if not exists customer_id uuid
  references public.profiles(id) on delete set null;

create index if not exists orders_customer_id_idx
  on public.orders(customer_id);

drop policy if exists "Customers can view their own orders"
  on public.orders;
create policy "Customers can view their own orders"
  on public.orders for select
  to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Customers can view items in their own orders"
  on public.order_items;
create policy "Customers can view items in their own orders"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.customer_id = (select auth.uid())
    )
  );

drop function if exists public.fulfill_paid_order(
  text, text, text, integer, text, jsonb, jsonb
);

create or replace function public.fulfill_paid_order(
  p_session_id text,
  p_customer_id uuid,
  p_customer_email text,
  p_customer_name text,
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
    amount_total_cents,
    currency,
    shipping_address
  )
  values (
    p_session_id,
    p_customer_id,
    p_customer_email,
    p_customer_name,
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

  return v_order_id;
end;
$$;

revoke all on function public.fulfill_paid_order(
  text, uuid, text, text, integer, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.fulfill_paid_order(
  text, uuid, text, text, integer, text, jsonb, jsonb
) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view product images"
  on storage.objects;
create policy "Anyone can view product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Artisans can upload images to their own folder"
  on storage.objects;
create policy "Artisans can upload images to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );

drop policy if exists "Artisans can update their own product images"
  on storage.objects;
create policy "Artisans can update their own product images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );

drop policy if exists "Artisans can delete their own product images"
  on storage.objects;
create policy "Artisans can delete their own product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'artisan'
    )
  );
