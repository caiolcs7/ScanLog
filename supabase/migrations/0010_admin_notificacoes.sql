-- Identificação: conta de administrador e notificações push.
-- 1. admin@scanlog.app tem os dois setores ao mesmo tempo e pode editar e
--    excluir tudo, inclusive itens e lotes já concluídos. A conta é criada no
--    painel do Supabase (Authentication → Users → Add user); a senha nunca vai
--    para o repositório.
-- 2. Notificações: a estrutura é avisada quando chega um levantamento novo e o
--    almoxarifado quando um código é preenchido. O banco chama a Edge Function
--    "notificar", que relê o lote/item e envia o Web Push uma única vez.

-- Papel pelo e-mail, agora com o administrador.
create or replace function public.set_sector_role() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) in ('almoxarifado@scanlog.app', 'estrutura@scanlog.app', 'admin@scanlog.app') then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', split_part(lower(new.email), '@', 1));
  end if;
  return new;
end $$;
revoke all on function public.set_sector_role() from public, anon, authenticated;
-- Conta criada antes desta migração também recebe o papel.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
 where lower(email) = 'admin@scanlog.app';

create or replace function public.items_guard() returns trigger
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
    if role not in ('almoxarifado', 'admin') then raise exception 'Somente o almoxarifado cadastra itens.'; end if;
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

  -- Administrador: altera qualquer campo, em qualquer status. Só as datas
  -- seguem o status para o histórico e a limpeza das fotos continuarem certos.
  if role = 'admin' then
    new.lot_id := old.lot_id; new.ord := old.ord;
    new.created_at := old.created_at; new.created_by := old.created_by;
    if new.status = 'pendente' then
      new.code := null; new.coded_at := null; new.coded_by := null;
    elsif new.status in ('codificado', 'sem_codigo') then
      if new.status = 'codificado' and new.code is null then raise exception 'Informe o código.'; end if;
      if new.status = 'sem_codigo' then
        if coalesce(new.code_note, '') = '' then raise exception 'Explique por que está sem código.'; end if;
        new.code := null;
      end if;
    elsif old.status <> 'confirmado' and old.status not in ('codificado', 'sem_codigo') then
      raise exception 'O item ainda não foi codificado.';
    end if;
    if new.status <> 'pendente'
       and (new.status, new.code, new.code_note) is distinct from (old.status, old.code, old.code_note)
       and not (new.status = 'confirmado' and old.status <> 'confirmado') then
      new.coded_at := now();
      new.coded_by := coalesce(nullif(new.coded_by, ''), 'Administrador');
    end if;
    if new.status = 'confirmado' then
      if old.status <> 'confirmado' then
        new.confirmed_at := now();
        new.confirmed_by := coalesce(nullif(new.confirmed_by, ''), 'Administrador');
        new.thumb_expires_at := now() + interval '150 days';
      end if;
      if new.photos = '[]'::jsonb and old.photos <> '[]'::jsonb then
        new.photos_deleted_at := coalesce(old.photos_deleted_at, now());
      end if;
    else
      new.confirmed_at := null; new.confirmed_by := null; new.thumb_expires_at := null;
    end if;
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
revoke all on function public.items_guard() from public, anon, authenticated;

create or replace function public.lots_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.app_role() not in ('almoxarifado', 'admin') and current_user = 'authenticated' then
    raise exception 'Somente o almoxarifado altera lotes.';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'rascunho'; new.item_count := 0; new.coded_count := 0; new.confirmed_count := 0;
    new.created_at := now(); new.sent_at := null; new.coded_at := null; new.confirmed_at := null;
  elsif current_user = 'authenticated' then
    -- Só renomeia ou envia; contadores e demais status vêm dos itens.
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
revoke all on function public.lots_guard() from public, anon, authenticated;

-- Regras de acesso com o administrador.
drop policy "setores leem lotes" on public.lots;
drop policy "almoxarifado cria lotes" on public.lots;
drop policy "almoxarifado altera lotes" on public.lots;
drop policy "almoxarifado exclui lotes" on public.lots;
drop policy "setores leem itens" on public.items;
drop policy "almoxarifado cria itens" on public.items;
drop policy "setores alteram itens" on public.items;
drop policy "almoxarifado exclui itens" on public.items;

create policy "setores leem lotes" on public.lots for select to authenticated
  using ((select public.app_role()) in ('almoxarifado', 'admin')
         or ((select public.app_role()) = 'estrutura' and status <> 'rascunho'));
create policy "almoxarifado cria lotes" on public.lots for insert to authenticated
  with check ((select public.app_role()) in ('almoxarifado', 'admin'));
create policy "almoxarifado altera lotes" on public.lots for update to authenticated
  using ((select public.app_role()) in ('almoxarifado', 'admin'))
  with check ((select public.app_role()) in ('almoxarifado', 'admin'));
create policy "almoxarifado exclui lotes" on public.lots for delete to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and confirmed_count = 0));

create policy "setores leem itens" on public.items for select to authenticated
  using ((select public.app_role()) in ('almoxarifado', 'admin')
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')));
create policy "almoxarifado cria itens" on public.items for insert to authenticated
  with check ((select public.app_role()) in ('almoxarifado', 'admin'));
create policy "setores alteram itens" on public.items for update to authenticated
  using ((select public.app_role()) in ('almoxarifado', 'admin')
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')))
  with check ((select public.app_role()) in ('almoxarifado', 'estrutura', 'admin'));
create policy "almoxarifado exclui itens" on public.items for delete to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and status <> 'confirmado'));

drop policy "setores leem fotos" on storage.objects;
drop policy "almoxarifado envia fotos" on storage.objects;
drop policy "almoxarifado substitui fotos" on storage.objects;
drop policy "almoxarifado apaga fotos" on storage.objects;
create policy "setores leem fotos" on storage.objects for select to authenticated
  using (bucket_id = 'identificacao' and (select public.app_role()) in ('almoxarifado', 'estrutura', 'admin'));
create policy "almoxarifado envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'identificacao'
              and (select public.app_role()) in ('almoxarifado', 'admin')
              and (storage.foldername(name))[1] in ('originais', 'miniaturas'));
create policy "almoxarifado substitui fotos" on storage.objects for update to authenticated
  using (bucket_id = 'identificacao' and (select public.app_role()) in ('almoxarifado', 'admin'));
create policy "almoxarifado apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'identificacao' and (select public.app_role()) in ('almoxarifado', 'admin'));

-- Notificações -------------------------------------------------------------

-- Aparelhos inscritos. Só a Edge Function (service_role) lê esta tabela.
create table public.push_inscricoes (
  endpoint text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  papel text not null check (papel in ('almoxarifado', 'estrutura', 'admin')),
  nome text check (length(nome) <= 60),
  user_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from anon, authenticated;

-- Avisos já enviados: cada levantamento e cada código avisa uma vez só.
create table public.push_enviados (
  chave text primary key check (length(chave) <= 200),
  enviado_em timestamptz not null default now()
);
alter table public.push_enviados enable row level security;
revoke all on public.push_enviados from anon, authenticated;

-- Chaves VAPID, geradas pela própria Edge Function no primeiro uso.
create table public.push_chaves (
  id int primary key default 1 check (id = 1),
  chaves jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.push_chaves enable row level security;
revoke all on public.push_chaves from anon, authenticated;

-- O aparelho se inscreve com o papel da conta logada (não escolhe o papel).
create function public.push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  role text := public.app_role();
begin
  if role not in ('almoxarifado', 'estrutura', 'admin') then raise exception 'Sem permissão.'; end if;
  insert into public.push_inscricoes (endpoint, p256dh, auth, papel, nome, user_id)
  values (p_endpoint, p_p256dh, p_auth, role, left(nullif(trim(p_nome), ''), 60), auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, papel = excluded.papel,
        nome = excluded.nome, user_id = excluded.user_id, atualizado_em = now();
end $$;
create function public.push_cancelar(p_endpoint text) returns void
language sql security definer set search_path = ''
as $$ delete from public.push_inscricoes where endpoint = p_endpoint $$;
revoke all on function public.push_inscrever(text, text, text, text) from public, anon;
revoke all on function public.push_cancelar(text) from public, anon;
grant execute on function public.push_inscrever(text, text, text, text) to authenticated;
grant execute on function public.push_cancelar(text) to authenticated;

-- Chama a Edge Function sem travar a gravação: falha no aviso não desfaz nada.
create function public.push_avisar() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://pygedyytlcplfweibenv.supabase.co/functions/v1/notificar',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('tipo', tg_argv[0], 'id', new.id),
      timeout_milliseconds := 10000
    );
  exception when others then
    null;
  end;
  return null;
end $$;
revoke all on function public.push_avisar() from public, anon, authenticated;

create trigger lots_push after update of status on public.lots
for each row when (old.status = 'rascunho' and new.status <> 'rascunho')
execute function public.push_avisar('lote');

create trigger items_push after update on public.items
for each row when (new.status in ('codificado', 'sem_codigo')
                   and (old.status, old.code, old.code_note) is distinct from (new.status, new.code, new.code_note))
execute function public.push_avisar('item');
