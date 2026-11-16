-- Identificação: conversa por item entre a estrutura e o almoxarifado.
-- A estrutura pede o que falta para identificar (uma medida, uma foto de um
-- detalhe ou uma informação) e o almoxarifado responde ali mesmo, com número,
-- foto ou texto. Os dois lados também podem escrever livremente.
-- Cada mensagem avisa o outro setor por push (Edge Function "notificar").

create table public.item_mensagens (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  lot_id uuid not null references public.lots (id) on delete cascade,
  -- Lado da conversa; o administrador escolhe o lado em cada mensagem.
  lado text not null check (lado in ('almoxarifado', 'estrutura')),
  autor_papel text not null check (autor_papel in ('almoxarifado', 'estrutura', 'admin')),
  autor_nome text not null check (length(autor_nome) between 1 and 60),
  tipo text not null check (tipo in ('pedido', 'resposta', 'texto')),
  -- O que foi pedido (só em pedido).
  pedido text check (pedido in ('medida', 'foto', 'info')),
  texto text check (length(texto) <= 500),
  medida numeric check (medida > 0 and medida < 1e7),
  unidade text check (unidade in ('mm', 'cm', 'm', 'pol', 'g', 'kg')),
  foto jsonb check (foto is null or jsonb_typeof(foto) = 'object'),
  responde_a uuid references public.item_mensagens (id) on delete set null,
  -- Situação do pedido: aberto até o almoxarifado responder, a estrutura
  -- cancelar ou o item receber o código.
  situacao text check (situacao in ('aberto', 'respondido', 'dispensado', 'cancelado')),
  fechado_em timestamptz,
  criado_em timestamptz not null default now(),
  check ((tipo = 'pedido') = (pedido is not null)),
  check ((tipo = 'pedido') = (situacao is not null)),
  check ((medida is null) = (unidade is null)),
  check (coalesce(length(trim(texto)), 0) > 0 or medida is not null or foto is not null)
);
create index item_mensagens_item on public.item_mensagens (item_id, criado_em);
create index item_mensagens_lot on public.item_mensagens (lot_id);
create index item_mensagens_abertos on public.item_mensagens (item_id) where situacao = 'aberto';
create index item_mensagens_responde on public.item_mensagens (responde_a) where responde_a is not null;

-- Resumo da conversa no item e no lote, mantido pelo banco.
alter table public.items
  add column msg_count int not null default 0,
  add column pedidos_abertos int not null default 0,
  add column ultima_msg text,
  add column ultima_msg_em timestamptz,
  add column ultima_msg_lado text check (ultima_msg_lado in ('almoxarifado', 'estrutura')),
  add column lido_almox_em timestamptz,
  add column lido_estrutura_em timestamptz;
alter table public.lots
  -- Itens com pedido esperando o almoxarifado.
  add column pedidos_abertos int not null default 0,
  -- Itens com mensagem nova para cada setor.
  add column novas_almox int not null default 0,
  add column novas_estrutura int not null default 0;

-- Os setores não gravam o resumo direto pela API: só o banco.
create function public.items_conversa_protege() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.msg_count := 0; new.pedidos_abertos := 0;
    new.ultima_msg := null; new.ultima_msg_em := null; new.ultima_msg_lado := null;
    new.lido_almox_em := null; new.lido_estrutura_em := null;
  else
    new.msg_count := old.msg_count; new.pedidos_abertos := old.pedidos_abertos;
    new.ultima_msg := old.ultima_msg; new.ultima_msg_em := old.ultima_msg_em;
    new.ultima_msg_lado := old.ultima_msg_lado;
    new.lido_almox_em := old.lido_almox_em; new.lido_estrutura_em := old.lido_estrutura_em;
  end if;
  return new;
end $$;
revoke all on function public.items_conversa_protege() from public, anon, authenticated;
create trigger items_conversa_protege before insert or update on public.items
for each row execute function public.items_conversa_protege();

-- Contadores do lote, agora com a conversa.
create or replace function public.lots_refresh() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  lot uuid := coalesce(new.lot_id, old.lot_id);
  total int; coded int; confirmed int; abertos int; n_almox int; n_estr int;
  current public.lot_status;
begin
  select count(*), count(*) filter (where status <> 'pendente'), count(*) filter (where status = 'confirmado'),
         count(*) filter (where pedidos_abertos > 0),
         count(*) filter (where ultima_msg_lado = 'estrutura'
                          and ultima_msg_em > coalesce(lido_almox_em, '-infinity'::timestamptz)),
         count(*) filter (where ultima_msg_lado = 'almoxarifado'
                          and ultima_msg_em > coalesce(lido_estrutura_em, '-infinity'::timestamptz))
    into total, coded, confirmed, abertos, n_almox, n_estr
    from public.items where lot_id = lot;
  select status into current from public.lots where id = lot;
  if current is null then return null; end if;
  update public.lots set
    item_count = total, coded_count = coded, confirmed_count = confirmed,
    pedidos_abertos = abertos, novas_almox = n_almox, novas_estrutura = n_estr,
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
revoke all on function public.lots_refresh() from public, anon, authenticated;

create or replace function public.lots_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.app_role() not in ('almoxarifado', 'admin') and current_user = 'authenticated' then
    raise exception 'Somente o almoxarifado altera lotes.';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'rascunho'; new.item_count := 0; new.coded_count := 0; new.confirmed_count := 0;
    new.pedidos_abertos := 0; new.novas_almox := 0; new.novas_estrutura := 0;
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
    new.pedidos_abertos := old.pedidos_abertos; new.novas_almox := old.novas_almox;
    new.novas_estrutura := old.novas_estrutura;
    new.created_at := old.created_at; new.created_by := old.created_by;
    new.coded_at := old.coded_at; new.confirmed_at := old.confirmed_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.lots_guard() from public, anon, authenticated;

-- Regras de cada mensagem, valendo também para chamadas diretas à API.
create function public.mensagens_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  role text := public.app_role();
  it record;
  alvo record;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if role not in ('almoxarifado', 'estrutura', 'admin') then raise exception 'Sem permissão.'; end if;
  if role <> 'admin' and new.lado <> role then raise exception 'Lado inválido.'; end if;

  -- Lê o item com as regras de acesso de quem escreve.
  select i.id, i.lot_id, i.status, l.status as lot_status into it
    from public.items i join public.lots l on l.id = i.lot_id
   where i.id = new.item_id;
  if it.id is null then raise exception 'Item não encontrado.'; end if;
  if it.lot_status = 'rascunho' then raise exception 'Envie o lote para a estrutura antes de conversar.'; end if;
  if it.status = 'confirmado' and role <> 'admin' then raise exception 'Item já confirmado.'; end if;

  new.id := coalesce(new.id, gen_random_uuid());
  new.lot_id := it.lot_id;
  new.autor_papel := role;
  new.autor_nome := left(coalesce(nullif(trim(new.autor_nome), ''), 'Sem nome'), 60);
  new.texto := nullif(trim(new.texto), '');
  -- Relógio real: duas mensagens na mesma transação ficam em ordem.
  new.criado_em := clock_timestamp();
  new.fechado_em := null;
  if new.foto is not null then
    if coalesce(new.foto ->> 'path', '') not like 'conversa/' || it.lot_id || '/' || it.id || '/%'
       or (new.foto ->> 'path') like '%..%' then
      raise exception 'Foto inválida.';
    end if;
    new.foto := jsonb_build_object(
      'path', new.foto ->> 'path',
      'width', coalesce((new.foto ->> 'width')::int, 0),
      'height', coalesce((new.foto ->> 'height')::int, 0));
  end if;

  if new.tipo = 'pedido' then
    if new.lado <> 'estrutura' then raise exception 'Só a estrutura faz pedidos.'; end if;
    if it.status <> 'pendente' then raise exception 'O item já foi codificado.'; end if;
    if new.texto is null then raise exception 'Diga o que precisa.'; end if;
    new.situacao := 'aberto';
    new.responde_a := null; new.medida := null; new.unidade := null;
  elsif new.tipo = 'resposta' then
    if new.lado <> 'almoxarifado' then raise exception 'Só o almoxarifado responde pedidos.'; end if;
    select m.id, m.item_id, m.situacao into alvo
      from public.item_mensagens m where m.id = new.responde_a;
    if alvo.id is null or alvo.item_id <> it.id then raise exception 'Pedido não encontrado.'; end if;
    if alvo.situacao <> 'aberto' then raise exception 'Este pedido já foi fechado.'; end if;
    new.situacao := null; new.pedido := null;
  else
    new.situacao := null; new.pedido := null; new.responde_a := null;
  end if;
  return new;
end $$;
revoke all on function public.mensagens_guard() from public, anon, authenticated;
create trigger mensagens_guard before insert on public.item_mensagens
for each row execute function public.mensagens_guard();

-- Prévia curta para o cartão do item e para o aviso.
create function public.mensagem_previa(m public.item_mensagens) returns text
language sql immutable set search_path = ''
as $$
  select left(concat_ws(' · ',
    case m.pedido when 'medida' then 'Medida' when 'foto' then 'Foto' when 'info' then 'Pergunta' end,
    case when m.medida is not null
         then replace(trim_scale(m.medida)::text, '.', ',') || ' ' || m.unidade end,
    case when m.foto is not null and m.tipo <> 'pedido' then 'Foto' end,
    m.texto), 160)
$$;
revoke all on function public.mensagem_previa(public.item_mensagens) from public, anon, authenticated;

-- Depois de gravar: fecha o pedido respondido e atualiza o resumo do item.
create function public.mensagens_depois() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'resposta' then
    update public.item_mensagens set situacao = 'respondido', fechado_em = now()
     where id = new.responde_a and situacao = 'aberto';
  end if;
  update public.items i set
    msg_count = (select count(*) from public.item_mensagens m where m.item_id = i.id),
    pedidos_abertos = (select count(*) from public.item_mensagens m
                        where m.item_id = i.id and m.situacao = 'aberto'),
    ultima_msg = public.mensagem_previa(new),
    ultima_msg_em = new.criado_em,
    ultima_msg_lado = new.lado,
    -- Quem escreve já leu a conversa.
    lido_almox_em = case when new.lado = 'almoxarifado' then new.criado_em else i.lido_almox_em end,
    lido_estrutura_em = case when new.lado = 'estrutura' then new.criado_em else i.lido_estrutura_em end
  where i.id = new.item_id;
  return null;
end $$;
revoke all on function public.mensagens_depois() from public, anon, authenticated;
create trigger mensagens_depois after insert on public.item_mensagens
for each row execute function public.mensagens_depois();

-- Código preenchido: os pedidos ainda abertos deixam de ser necessários.
create function public.items_conversa_fecha() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.item_mensagens set situacao = 'dispensado', fechado_em = now()
   where item_id = new.id and situacao = 'aberto';
  update public.items set pedidos_abertos = 0 where id = new.id;
  return null;
end $$;
revoke all on function public.items_conversa_fecha() from public, anon, authenticated;
create trigger items_conversa_fecha after update of status on public.items
for each row when (old.status = 'pendente' and new.status <> 'pendente' and new.pedidos_abertos > 0)
execute function public.items_conversa_fecha();

-- Marca a conversa como lida pelo setor de quem abriu.
create function public.conversa_lida(p_item uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  role text := public.app_role();
begin
  if role = 'almoxarifado' then
    update public.items set lido_almox_em = clock_timestamp()
     where id = p_item and ultima_msg_em > coalesce(lido_almox_em, '-infinity'::timestamptz);
  elsif role = 'estrutura' then
    update public.items i set lido_estrutura_em = clock_timestamp()
     where i.id = p_item and i.ultima_msg_em > coalesce(i.lido_estrutura_em, '-infinity'::timestamptz)
       and exists (select 1 from public.lots l where l.id = i.lot_id and l.status <> 'rascunho');
  end if;
  -- Administrador lê sem apagar o aviso dos setores.
end $$;
revoke all on function public.conversa_lida(uuid) from public, anon;
grant execute on function public.conversa_lida(uuid) to authenticated;

-- A estrutura desiste de um pedido que ela mesma abriu.
create function public.pedido_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  role text := public.app_role();
  alvo uuid;
begin
  if role not in ('estrutura', 'admin') then raise exception 'Só a estrutura cancela pedidos.'; end if;
  update public.item_mensagens set situacao = 'cancelado', fechado_em = now()
   where id = p_id and situacao = 'aberto'
  returning item_id into alvo;
  if alvo is null then raise exception 'Este pedido já foi fechado.'; end if;
  update public.items i set pedidos_abertos =
    (select count(*) from public.item_mensagens m where m.item_id = i.id and m.situacao = 'aberto')
   where i.id = alvo;
end $$;
revoke all on function public.pedido_cancelar(uuid) from public, anon;
grant execute on function public.pedido_cancelar(uuid) to authenticated;

alter table public.item_mensagens enable row level security;
create policy "setores leem mensagens" on public.item_mensagens for select to authenticated
  using ((select public.app_role()) in ('almoxarifado', 'admin')
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')));
create policy "setores escrevem mensagens" on public.item_mensagens for insert to authenticated
  with check ((select public.app_role()) in ('almoxarifado', 'estrutura', 'admin'));
revoke all on public.item_mensagens from anon, authenticated;
grant select, insert on public.item_mensagens to authenticated;

-- Fotos da conversa: os dois setores enviam, só na pasta conversa/.
drop policy "almoxarifado envia fotos" on storage.objects;
create policy "almoxarifado envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'identificacao'
              and (((select public.app_role()) in ('almoxarifado', 'admin')
                    and (storage.foldername(name))[1] in ('originais', 'miniaturas', 'conversa'))
                   or ((select public.app_role()) = 'estrutura'
                       and (storage.foldername(name))[1] = 'conversa')));

-- Conversa aberta na tela recebe as mensagens novas na hora (Realtime).
alter publication supabase_realtime add table public.item_mensagens;

-- Aviso para o outro setor a cada mensagem.
create trigger mensagens_push after insert on public.item_mensagens
for each row execute function public.push_avisar('mensagem');
