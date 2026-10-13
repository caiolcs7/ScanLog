-- Identificação compartilhada: lotes e itens sem código, com dois setores.
-- Papel em auth.users.raw_app_meta_data->>'role': 'almoxarifado' | 'estrutura'.

create type public.lot_status as enum ('rascunho', 'enviado', 'codificado', 'confirmado');
create type public.item_status as enum ('pendente', 'codificado', 'sem_codigo', 'confirmado');

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  status public.lot_status not null default 'rascunho',
  item_count int not null default 0,
  coded_count int not null default 0,
  confirmed_count int not null default 0,
  created_at timestamptz not null default now(),
  created_by text not null check (length(created_by) between 1 and 60),
  sent_at timestamptz,
  coded_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id) on delete cascade,
  ord int not null check (ord > 0),
  status public.item_status not null default 'pendente',
  address text check (length(address) <= 128),
  bombona text check (length(bombona) <= 32),
  weight_g numeric check (weight_g > 0 and weight_g <= 1e9),
  note text check (length(note) <= 500),
  photos jsonb not null default '[]'::jsonb,
  thumb_path text,
  created_at timestamptz not null default now(),
  created_by text not null check (length(created_by) between 1 and 60),
  code text check (length(code) between 1 and 128),
  code_note text check (length(code_note) <= 500),
  coded_at timestamptz,
  coded_by text check (length(coded_by) <= 60),
  confirmed_at timestamptz,
  confirmed_by text check (length(confirmed_by) <= 60),
  photos_deleted_at timestamptz,
  thumb_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (lot_id, ord)
);
create index items_thumb_expires on public.items (thumb_expires_at) where thumb_path is not null;
create index items_confirmed_photos on public.items (confirmed_at) where photos_deleted_at is null and confirmed_at is not null;

-- Papel do usuário logado, lido do JWT (app_metadata não é editável pelo usuário).
create function public.app_role() returns text
language sql stable set search_path = ''
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') $$;


-- Regras de escrita por setor, válidas também para chamadas diretas à API.
create function public.items_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  role text := public.app_role();
begin
  -- Rotina de limpeza (service_role) e manutenção pelo painel.
  if current_user not in ('authenticated', 'anon') then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    if role <> 'almoxarifado' then raise exception 'Somente o almoxarifado cadastra itens.'; end if;
    -- Numeração no servidor: dois aparelhos no mesmo lote não colidem.
    perform pg_advisory_xact_lock(hashtext(new.lot_id::text));
    new.ord := coalesce((select max(i.ord) from public.items i where i.lot_id = new.lot_id), 0) + 1;
    new.status := 'pendente';
    new.code := null; new.code_note := null; new.coded_at := null; new.coded_by := null;
    new.confirmed_at := null; new.confirmed_by := null; new.photos_deleted_at := null; new.thumb_expires_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'confirmado' then
    -- Depois da confirmação, o almoxarifado só pode apagar os originais.
    if role = 'almoxarifado' and new.photos = '[]'::jsonb
       and (new.lot_id, new.ord, new.status, new.address, new.bombona, new.weight_g, new.note, new.thumb_path, new.code, new.code_note, new.coded_at, new.coded_by, new.confirmed_at, new.confirmed_by, new.thumb_expires_at, new.created_at, new.created_by)
       is not distinct from
       (old.lot_id, old.ord, old.status, old.address, old.bombona, old.weight_g, old.note, old.thumb_path, old.code, old.code_note, old.coded_at, old.coded_by, old.confirmed_at, old.confirmed_by, old.thumb_expires_at, old.created_at, old.created_by) then
      new.photos_deleted_at := coalesce(old.photos_deleted_at, now());
      new.updated_at := now();
      return new;
    end if;
    raise exception 'Item já confirmado.';
  end if;

  if role = 'estrutura' then
    if (new.lot_id, new.ord, new.address, new.bombona, new.weight_g, new.note, new.photos, new.thumb_path, new.created_at, new.created_by, new.confirmed_at, new.confirmed_by, new.photos_deleted_at)
       is distinct from
       (old.lot_id, old.ord, old.address, old.bombona, old.weight_g, old.note, old.photos, old.thumb_path, old.created_at, old.created_by, old.confirmed_at, old.confirmed_by, old.photos_deleted_at) then
      raise exception 'A estrutura só altera o código.';
    end if;
    if new.status not in ('pendente', 'codificado', 'sem_codigo') then raise exception 'Status inválido.'; end if;
    if new.status = 'codificado' and new.code is null then raise exception 'Informe o código.'; end if;
    if new.status = 'sem_codigo' and coalesce(new.code_note, '') = '' then raise exception 'Explique por que está sem código.'; end if;
    if new.status = 'sem_codigo' then new.code := null; end if;
    if new.status = 'pendente' then new.code := null; new.coded_at := null; new.coded_by := null;
    else new.coded_at := now(); end if;
  elsif role = 'almoxarifado' then
    if new.status = 'pendente' then
      -- Pendente nunca tem código; devolver à estrutura descarta o anterior.
      new.code := null; new.coded_at := null; new.coded_by := null;
    elsif (new.code, new.coded_at, new.coded_by) is distinct from (old.code, old.coded_at, old.coded_by) then
      raise exception 'O almoxarifado não altera o código.';
    end if;
    if new.lot_id <> old.lot_id or new.ord <> old.ord or new.created_at <> old.created_at or new.created_by <> old.created_by then
      raise exception 'Campo protegido.';
    end if;
    if new.status = 'confirmado' then
      if old.status not in ('codificado', 'sem_codigo') then raise exception 'O item ainda não foi codificado.'; end if;
      new.confirmed_at := now();
      new.confirmed_by := coalesce(nullif(new.confirmed_by, ''), 'Almoxarifado');
      new.thumb_expires_at := now() + interval '150 days';
    else
      if new.status <> old.status and new.status <> 'pendente' then raise exception 'Status inválido.'; end if;
      new.confirmed_at := old.confirmed_at; new.confirmed_by := old.confirmed_by;
      new.thumb_expires_at := old.thumb_expires_at; new.photos_deleted_at := old.photos_deleted_at;
    end if;
  else
    raise exception 'Sem permissão.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger items_guard before insert or update on public.items
for each row execute function public.items_guard();

-- Contadores e status do lote, recalculados a cada mudança nos itens.
create function public.lots_refresh() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  lot uuid := coalesce(new.lot_id, old.lot_id);
  total int; coded int; confirmed int;
  current public.lot_status;
begin
  select count(*), count(*) filter (where status <> 'pendente'), count(*) filter (where status = 'confirmado')
    into total, coded, confirmed from public.items where lot_id = lot;
  select status into current from public.lots where id = lot;
  if current is null then return null; end if;
  update public.lots set
    item_count = total, coded_count = coded, confirmed_count = confirmed,
    status = case
      when current = 'rascunho' then 'rascunho'
      when total > 0 and confirmed = total then 'confirmado'
      when total > 0 and coded = total then 'codificado'
      else 'enviado' end::public.lot_status,
    coded_at = case when total > 0 and coded = total then coalesce(coded_at, now()) else null end,
    confirmed_at = case when total > 0 and confirmed = total then coalesce(confirmed_at, now()) else null end,
    updated_at = now()
  where id = lot;
  return null;
end $$;

create trigger items_refresh_lot after insert or update or delete on public.items
for each row execute function public.lots_refresh();

create function public.lots_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.app_role() <> 'almoxarifado' and current_user = 'authenticated' then
    raise exception 'Somente o almoxarifado altera lotes.';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'rascunho'; new.item_count := 0; new.coded_count := 0; new.confirmed_count := 0;
    new.created_at := now(); new.sent_at := null; new.coded_at := null; new.confirmed_at := null;
  elsif current_user = 'authenticated' then
    -- O almoxarifado só renomeia ou envia; contadores e demais status vêm dos itens.
    if new.status <> old.status then
      if old.status = 'rascunho' and new.status = 'enviado' then
        if old.item_count = 0 then raise exception 'Cadastre ao menos um item antes de enviar.'; end if;
        new.sent_at := now();
        new.status := case
          when old.confirmed_count = old.item_count then 'confirmado'
          when old.coded_count = old.item_count then 'codificado'
          else 'enviado' end;
      else
        raise exception 'Mudança de status inválida.';
      end if;
    end if;
    new.item_count := old.item_count; new.coded_count := old.coded_count; new.confirmed_count := old.confirmed_count;
    new.created_at := old.created_at; new.created_by := old.created_by;
    new.coded_at := old.coded_at; new.confirmed_at := old.confirmed_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger lots_guard before insert or update on public.lots
for each row execute function public.lots_guard();

alter table public.lots enable row level security;
alter table public.items enable row level security;

create policy "setores leem lotes" on public.lots for select to authenticated
  using ((select public.app_role()) in ('almoxarifado', 'estrutura')
         and (status <> 'rascunho' or (select public.app_role()) = 'almoxarifado'));
create policy "almoxarifado cria lotes" on public.lots for insert to authenticated
  with check ((select public.app_role()) = 'almoxarifado');
create policy "almoxarifado altera lotes" on public.lots for update to authenticated
  using ((select public.app_role()) = 'almoxarifado') with check ((select public.app_role()) = 'almoxarifado');
create policy "almoxarifado exclui lotes" on public.lots for delete to authenticated
  using ((select public.app_role()) = 'almoxarifado' and confirmed_count = 0);

create policy "setores leem itens" on public.items for select to authenticated
  using ((select public.app_role()) = 'almoxarifado'
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')));
create policy "almoxarifado cria itens" on public.items for insert to authenticated
  with check ((select public.app_role()) = 'almoxarifado');
create policy "setores alteram itens" on public.items for update to authenticated
  using ((select public.app_role()) = 'almoxarifado'
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')))
  with check ((select public.app_role()) in ('almoxarifado', 'estrutura'));
create policy "almoxarifado exclui itens" on public.items for delete to authenticated
  using ((select public.app_role()) = 'almoxarifado' and status <> 'confirmado');

revoke all on public.lots, public.items from anon;
grant select, insert, update, delete on public.lots, public.items to authenticated;

-- Fotos: bucket privado. Originais até a confirmação; miniatura por 150 dias.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identificacao', 'identificacao', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "setores leem fotos" on storage.objects for select to authenticated
  using (bucket_id = 'identificacao' and (select public.app_role()) in ('almoxarifado', 'estrutura'));
create policy "almoxarifado envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'identificacao' and (select public.app_role()) = 'almoxarifado');
create policy "almoxarifado substitui fotos" on storage.objects for update to authenticated
  using (bucket_id = 'identificacao' and (select public.app_role()) = 'almoxarifado');
create policy "almoxarifado apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'identificacao' and (select public.app_role()) = 'almoxarifado');
revoke all on function public.lots_refresh() from public, anon, authenticated;
