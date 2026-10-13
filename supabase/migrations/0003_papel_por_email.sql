-- O papel do setor é definido pelo e-mail da conta, criada no painel do Supabase
-- (Authentication → Users → Add user): almoxarifado@scanlog.app e estrutura@scanlog.app.
create function public.set_sector_role() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) in ('almoxarifado@scanlog.app', 'estrutura@scanlog.app') then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', split_part(lower(new.email), '@', 1));
  end if;
  return new;
end $$;
revoke all on function public.set_sector_role() from public, anon, authenticated;

create trigger set_sector_role before insert or update of email, raw_app_meta_data on auth.users
for each row execute function public.set_sector_role();
