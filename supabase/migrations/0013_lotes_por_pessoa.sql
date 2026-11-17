-- Identificação: cada pessoa do almoxarifado vê só os lotes dela.
-- O administrador vê tudo; a estrutura continua vendo todos os lotes enviados.
-- Contas das pessoas: <usuario>@scanlog.app, criadas pela função Edge "pessoas"
-- (papel 'almoxarifado' no app_metadata). A conta compartilhada do almoxarifado
-- deixa de ver lotes: só serve para trocar o aparelho para a conta da pessoa.

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 2 and 60),
  login text not null unique
    check (login ~ '^[a-z0-9][a-z0-9._-]{1,29}$' and login not in ('almoxarifado', 'estrutura', 'admin')),
  papel text not null default 'almoxarifado' check (papel = 'almoxarifado'),
  user_id uuid unique references auth.users (id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- Nome igual, sem diferença de maiúscula, acento ou espaço: uma pessoa só.
create function public.nome_chave(p text) returns text
language sql immutable set search_path = ''
as $$
  select lower(translate(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;
create unique index pessoas_nome_chave on public.pessoas (public.nome_chave(nome));

alter table public.pessoas enable row level security;
revoke all on public.pessoas from anon, authenticated;
grant select on public.pessoas to authenticated;
create policy "admin e a própria pessoa leem" on public.pessoas for select to authenticated
  using ((select public.app_role()) = 'admin' or user_id = (select auth.uid()));

-- Pessoa ativa da conta logada (nula na conta compartilhada e nos outros setores).
create function public.minha_pessoa() returns uuid
language sql stable security definer set search_path = ''
as $$ select p.id from public.pessoas p where p.user_id = auth.uid() and p.ativo $$;
revoke all on function public.minha_pessoa() from public, anon;
grant execute on function public.minha_pessoa() to authenticated;

alter table public.lots add column dono uuid references public.pessoas (id) on delete set null;
create index lots_dono on public.lots (dono);

-- O lote é desta pessoa do almoxarifado?
create function public.lote_meu(p_lot uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.lots l
                  where l.id = p_lot and l.dono is not null and l.dono = public.minha_pessoa())
$$;
-- Arquivo em <pasta>/<lote>/... de um lote desta pessoa?
create function public.arquivo_meu(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.lots l
                  where l.id::text = split_part(p_name, '/', 2)
                    and l.dono is not null and l.dono = public.minha_pessoa())
$$;
revoke all on function public.lote_meu(uuid) from public, anon;
revoke all on function public.arquivo_meu(text) from public, anon;
grant execute on function public.lote_meu(uuid) to authenticated;
grant execute on function public.arquivo_meu(text) to authenticated;

-- Lotes antigos: dono pelo nome de quem cadastrou (uma pessoa por nome).
create function public.pessoas_semear() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  n int;
begin
  insert into public.pessoas (nome, login)
  select nome,
         base || case when row_number() over (partition by base order by nome) > 1
                      then row_number() over (partition by base order by nome)::text else '' end
    from (
      select distinct on (public.nome_chave(l.created_by)) trim(l.created_by) as nome,
             coalesce(nullif(left(regexp_replace(split_part(public.nome_chave(l.created_by), ' ', 1), '[^a-z0-9]', '', 'g'), 28), ''), 'pessoa') as base
        from public.lots l
       where l.dono is null
         and not exists (select 1 from public.pessoas p where public.nome_chave(p.nome) = public.nome_chave(l.created_by))
       order by public.nome_chave(l.created_by), l.created_at
    ) novos
  on conflict do nothing;
  update public.lots l set dono = p.id
    from public.pessoas p
   where l.dono is null and public.nome_chave(p.nome) = public.nome_chave(l.created_by);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.pessoas_semear() from public, anon, authenticated;

-- Dono e nome de quem cadastrou vêm da conta; só o administrador troca o dono.
create or replace function public.lots_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  role text := public.app_role();
  eu uuid;
begin
  if role not in ('almoxarifado', 'admin') and current_user = 'authenticated' then
    raise exception 'Somente o almoxarifado altera lotes.';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'rascunho'; new.item_count := 0; new.coded_count := 0; new.confirmed_count := 0;
    new.created_at := now(); new.sent_at := null; new.coded_at := null; new.confirmed_at := null;
    if current_user = 'authenticated' and role = 'almoxarifado' then
      eu := public.minha_pessoa();
      if eu is null then raise exception 'Entre com o seu usuário para cadastrar.'; end if;
      new.dono := eu;
      new.created_by := (select p.nome from public.pessoas p where p.id = eu);
    end if;
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
    if role <> 'admin' then new.dono := old.dono; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.lots_guard() from public, anon, authenticated;

-- Regras de acesso por pessoa.
drop policy "setores leem lotes" on public.lots;
drop policy "almoxarifado cria lotes" on public.lots;
drop policy "almoxarifado altera lotes" on public.lots;
drop policy "almoxarifado exclui lotes" on public.lots;
create policy "setores leem lotes" on public.lots for select to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and dono is not null and dono = (select public.minha_pessoa()))
         or ((select public.app_role()) = 'estrutura' and status <> 'rascunho'));
create policy "almoxarifado cria lotes" on public.lots for insert to authenticated
  with check ((select public.app_role()) = 'admin'
              or ((select public.app_role()) = 'almoxarifado' and dono = (select public.minha_pessoa())));
create policy "almoxarifado altera lotes" on public.lots for update to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and dono = (select public.minha_pessoa())))
  with check ((select public.app_role()) = 'admin'
              or ((select public.app_role()) = 'almoxarifado' and dono = (select public.minha_pessoa())));
create policy "almoxarifado exclui lotes" on public.lots for delete to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and dono = (select public.minha_pessoa()) and confirmed_count = 0));

drop policy "setores leem itens" on public.items;
drop policy "almoxarifado cria itens" on public.items;
drop policy "setores alteram itens" on public.items;
drop policy "almoxarifado exclui itens" on public.items;
create policy "setores leem itens" on public.items for select to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id))
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')));
create policy "almoxarifado cria itens" on public.items for insert to authenticated
  with check ((select public.app_role()) = 'admin'
              or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id)));
create policy "setores alteram itens" on public.items for update to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id))
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')))
  with check ((select public.app_role()) in ('estrutura', 'admin')
              or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id)));
create policy "almoxarifado exclui itens" on public.items for delete to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id) and status <> 'confirmado'));

drop policy "setores leem mensagens" on public.item_mensagens;
drop policy "setores escrevem mensagens" on public.item_mensagens;
create policy "setores leem mensagens" on public.item_mensagens for select to authenticated
  using ((select public.app_role()) = 'admin'
         or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id))
         or ((select public.app_role()) = 'estrutura'
             and exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'rascunho')));
create policy "setores escrevem mensagens" on public.item_mensagens for insert to authenticated
  with check ((select public.app_role()) in ('estrutura', 'admin')
              or ((select public.app_role()) = 'almoxarifado' and public.lote_meu(lot_id)));

-- Conversa lida: o almoxarifado só marca itens dos lotes dele.
create or replace function public.conversa_lida(p_item uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  role text := public.app_role();
begin
  if role = 'almoxarifado' then
    update public.items set lido_almox_em = clock_timestamp()
     where id = p_item and ultima_msg_em > coalesce(lido_almox_em, '-infinity'::timestamptz)
       and public.lote_meu(lot_id);
  elsif role = 'estrutura' then
    update public.items i set lido_estrutura_em = clock_timestamp()
     where i.id = p_item and i.ultima_msg_em > coalesce(i.lido_estrutura_em, '-infinity'::timestamptz)
       and exists (select 1 from public.lots l where l.id = i.lot_id and l.status <> 'rascunho');
  end if;
  -- Administrador lê sem apagar o aviso dos setores.
end $$;
revoke all on function public.conversa_lida(uuid) from public, anon;
grant execute on function public.conversa_lida(uuid) to authenticated;

drop policy "setores leem fotos" on storage.objects;
drop policy "almoxarifado envia fotos" on storage.objects;
drop policy "almoxarifado substitui fotos" on storage.objects;
drop policy "almoxarifado apaga fotos" on storage.objects;
create policy "setores leem fotos" on storage.objects for select to authenticated
  using (bucket_id = 'identificacao'
         and ((select public.app_role()) in ('estrutura', 'admin')
              or ((select public.app_role()) = 'almoxarifado' and public.arquivo_meu(name))));
create policy "almoxarifado envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'identificacao'
              and (((select public.app_role()) = 'admin'
                    and (storage.foldername(name))[1] in ('originais', 'miniaturas', 'conversa'))
                   or ((select public.app_role()) = 'almoxarifado' and public.arquivo_meu(name)
                       and (storage.foldername(name))[1] in ('originais', 'miniaturas', 'conversa'))
                   or ((select public.app_role()) = 'estrutura'
                       and (storage.foldername(name))[1] = 'conversa')));
create policy "almoxarifado substitui fotos" on storage.objects for update to authenticated
  using (bucket_id = 'identificacao'
         and ((select public.app_role()) = 'admin'
              or ((select public.app_role()) = 'almoxarifado' and public.arquivo_meu(name))));
create policy "almoxarifado apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'identificacao'
         and ((select public.app_role()) = 'admin'
              or ((select public.app_role()) = 'almoxarifado' and public.arquivo_meu(name))));

-- Troca automática dos aparelhos que já estavam na conta compartilhada --------

-- Momento em que esta migração rodou: só sessões abertas antes podem trocar,
-- por até 45 dias. Cada sessão troca para uma pessoa só.
create table public.pessoas_migracao (
  id int primary key default 1 check (id = 1),
  inicio timestamptz not null default now()
);
insert into public.pessoas_migracao default values;
create table public.pessoas_migradas (
  session_id uuid primary key,
  pessoa uuid not null references public.pessoas (id) on delete cascade,
  em timestamptz not null default now()
);
alter table public.pessoas_migracao enable row level security;
alter table public.pessoas_migradas enable row level security;
revoke all on public.pessoas_migracao, public.pessoas_migradas from anon, authenticated;

-- Chamada só pela função Edge (service_role), com a sessão já conferida por ela.
create function public.pessoas_para_migrar(p_user uuid, p_session uuid, p_nome text)
returns table (id uuid, nome text, login text, user_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  ini timestamptz;
  sess timestamptz;
  alvo public.pessoas;
begin
  select m.inicio into ini from public.pessoas_migracao m;
  if now() > ini + interval '45 days' then raise exception 'migracao_encerrada'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user and lower(u.email) = 'almoxarifado@scanlog.app') then
    raise exception 'conta_invalida';
  end if;
  select s.created_at into sess from auth.sessions s where s.id = p_session and s.user_id = p_user;
  if sess is null or sess > ini then raise exception 'sessao_nova'; end if;
  select * into alvo from public.pessoas p
   where public.nome_chave(p.nome) = public.nome_chave(p_nome) and p.ativo;
  if alvo.id is null then raise exception 'sem_pessoa'; end if;
  -- Pode repetir (falha de rede no meio), mas sempre para a mesma pessoa.
  insert into public.pessoas_migradas (session_id, pessoa) values (p_session, alvo.id)
  on conflict (session_id) do nothing;
  if (select x.pessoa from public.pessoas_migradas x where x.session_id = p_session) <> alvo.id then
    raise exception 'sessao_usada';
  end if;
  return query select alvo.id, alvo.nome, alvo.login, alvo.user_id;
end $$;
-- Conta já criada no Auth (ex.: dois aparelhos da mesma pessoa ao mesmo tempo).
create function public.pessoas_conta_por_email(p_email text) returns uuid
language sql stable security definer set search_path = ''
as $$ select u.id from auth.users u where lower(u.email) = lower(p_email) $$;
revoke all on function public.pessoas_para_migrar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pessoas_conta_por_email(text) from public, anon, authenticated;
grant execute on function public.pessoas_para_migrar(uuid, uuid, text) to service_role;
grant execute on function public.pessoas_conta_por_email(text) to service_role;
grant select, insert, update on public.pessoas to service_role;

select public.pessoas_semear();
