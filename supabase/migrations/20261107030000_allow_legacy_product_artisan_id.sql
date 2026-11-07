do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'artisan_id'
      and is_nullable = 'NO'
  ) then
    alter table public.products
      alter column artisan_id drop not null;
  end if;
end;
$$;
