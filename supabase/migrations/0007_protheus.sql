-- Cópia diária dos produtos do Protheus (rota MACWS009/consultar/produto).
-- O Protheus só existe na rede da empresa, então quem lê é um script num PC de
-- lá (sync-protheus/), que grava aqui pelas funções protheus_*. As páginas leem
-- só daqui. O script se identifica com um token aleatório que nunca sai do PC:
-- o banco guarda apenas o sha256 dele, colado no SQL Editor na instalação.
-- Só entram códigos desbloqueados (Bloqueado = Não); o filtro é feito no PC.

create extension if not exists pgcrypto with schema extensions;

create schema protheus_priv;
revoke all on schema protheus_priv from public, anon, authenticated;

create table protheus_priv.config (
  id boolean primary key default true check (id),
  token_hash text check (token_hash ~ '^[0-9a-f]{64}$')
);
insert into protheus_priv.config default values;

create table public.protheus_execucoes (
  id bigint generated always as identity primary key,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  completo boolean,
  lidos integer,
  gravados integer not null default 0,
  pulados integer,
  removidos integer
);

create table public.protheus_produtos (
  codigo text primary key,
  descricao text,
  tipo text,
  unidade text,
  saldo_estoque numeric,
  saldo_compra numeric,
  saldo_solicitacao numeric,
  custo numeric,
  moeda text,
  fab_importado text,
  fab_nacional text,
  ponto_pedido numeric,
  lote_economico numeric,
  prazo_entrega integer,
  execucao bigint not null,
  -- Muda só quando algum campo mudou; serve para mostrar "o que mudou hoje".
  atualizado_em timestamptz not null default now()
);
create index protheus_produtos_atualizado on public.protheus_produtos (atualizado_em desc);

alter table public.protheus_execucoes enable row level security;
alter table public.protheus_produtos enable row level security;
create policy "todos leem" on public.protheus_execucoes for select to anon, authenticated using (true);
create policy "todos leem" on public.protheus_produtos for select to anon, authenticated using (true);
revoke insert, update, delete, truncate, references, trigger
  on public.protheus_execucoes, public.protheus_produtos
  from anon, authenticated;

create function protheus_priv.token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from protheus_priv.config
    where token_hash is not null
      and p_token is not null
      and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  );
$$;

create function protheus_priv.exigir_token(p_token text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not protheus_priv.token_ok(p_token) then
    raise exception 'Token do sincronizador inválido.' using errcode = '42501';
  end if;
end;
$$;

-- Abre uma execução e devolve o número dela.
create function public.protheus_iniciar(p_token text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform protheus_priv.exigir_token(p_token);
  delete from public.protheus_execucoes where iniciado_em < now() - interval '90 days';
  insert into public.protheus_execucoes default values returning id into v_id;
  return v_id;
end;
$$;

-- Grava um lote (até 2000 itens) da execução.
create function public.protheus_gravar(p_token text, p_execucao bigint, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform protheus_priv.exigir_token(p_token);
  if not exists (select 1 from public.protheus_execucoes where id = p_execucao and terminado_em is null) then
    raise exception 'Execução % não está aberta.', p_execucao;
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 2000 then
    raise exception 'Lote inválido.';
  end if;

  insert into public.protheus_produtos as p (
    codigo, descricao, tipo, unidade, saldo_estoque, saldo_compra, saldo_solicitacao,
    custo, moeda, fab_importado, fab_nacional, ponto_pedido, lote_economico, prazo_entrega,
    execucao, atualizado_em
  )
  select distinct on (codigo)
    codigo,
    left(nullif(btrim(i ->> 'descricao'), ''), 500),
    left(nullif(btrim(i ->> 'tipo'), ''), 10),
    left(nullif(btrim(i ->> 'unidade'), ''), 10),
    (i ->> 'saldo_estoque')::numeric,
    (i ->> 'saldo_compra')::numeric,
    (i ->> 'saldo_solicitacao')::numeric,
    (i ->> 'custo')::numeric,
    left(nullif(btrim(i ->> 'moeda'), ''), 20),
    left(nullif(btrim(i ->> 'fab_importado'), ''), 120),
    left(nullif(btrim(i ->> 'fab_nacional'), ''), 120),
    (i ->> 'ponto_pedido')::numeric,
    (i ->> 'lote_economico')::numeric,
    (i ->> 'prazo_entrega')::numeric::integer,
    p_execucao,
    now()
  from (
    select i, upper(btrim(i ->> 'codigo')) as codigo
    from jsonb_array_elements(p_itens) as i
  ) as itens
  where codigo ~ '^[A-Z0-9][A-Z0-9./_-]{0,39}$'
  order by codigo
  on conflict (codigo) do update set
    descricao = excluded.descricao,
    tipo = excluded.tipo,
    unidade = excluded.unidade,
    saldo_estoque = excluded.saldo_estoque,
    saldo_compra = excluded.saldo_compra,
    saldo_solicitacao = excluded.saldo_solicitacao,
    custo = excluded.custo,
    moeda = excluded.moeda,
    fab_importado = excluded.fab_importado,
    fab_nacional = excluded.fab_nacional,
    ponto_pedido = excluded.ponto_pedido,
    lote_economico = excluded.lote_economico,
    prazo_entrega = excluded.prazo_entrega,
    execucao = excluded.execucao,
    atualizado_em = case
      when (p.descricao, p.tipo, p.unidade, p.saldo_estoque, p.saldo_compra, p.saldo_solicitacao,
            p.custo, p.moeda, p.fab_importado, p.fab_nacional, p.ponto_pedido, p.lote_economico,
            p.prazo_entrega)
        is distinct from
           (excluded.descricao, excluded.tipo, excluded.unidade, excluded.saldo_estoque,
            excluded.saldo_compra, excluded.saldo_solicitacao, excluded.custo, excluded.moeda,
            excluded.fab_importado, excluded.fab_nacional, excluded.ponto_pedido,
            excluded.lote_economico, excluded.prazo_entrega)
      then now()
      else p.atualizado_em
    end;
  get diagnostics v_n = row_count;

  update public.protheus_execucoes set gravados = gravados + v_n where id = p_execucao;
  return v_n;
end;
$$;

-- Fecha a execução. Se ela leu a lista inteira, apaga quem não veio (código
-- que foi bloqueado ou excluído). Proteção: não apaga nada se esta execução
-- gravou menos de 80% do que já existia (leitura incompleta ou Protheus fora).
create function public.protheus_finalizar(
  p_token text, p_execucao bigint, p_completo boolean, p_lidos integer, p_pulados integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gravados integer;
  v_total integer;
  v_removidos integer := 0;
begin
  perform protheus_priv.exigir_token(p_token);
  select gravados into v_gravados
  from public.protheus_execucoes where id = p_execucao and terminado_em is null;
  if not found then
    raise exception 'Execução % não está aberta.', p_execucao;
  end if;

  select count(*) into v_total from public.protheus_produtos;
  if p_completo and v_gravados > 0 and v_gravados >= 0.8 * (v_total - (
    select count(*) from public.protheus_produtos where execucao = p_execucao
  ) + v_gravados) then
    delete from public.protheus_produtos where execucao <> p_execucao;
    get diagnostics v_removidos = row_count;
  end if;

  update public.protheus_execucoes
  set terminado_em = now(), completo = p_completo, lidos = p_lidos, pulados = p_pulados,
      removidos = v_removidos
  where id = p_execucao;
  return v_removidos;
end;
$$;

revoke all on all functions in schema protheus_priv from public, anon, authenticated;
revoke all on function public.protheus_iniciar(text) from public;
revoke all on function public.protheus_gravar(text, bigint, jsonb) from public;
revoke all on function public.protheus_finalizar(text, bigint, boolean, integer, integer) from public;
grant execute on function public.protheus_iniciar(text) to anon, authenticated;
grant execute on function public.protheus_gravar(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.protheus_finalizar(text, bigint, boolean, integer, integer) to anon, authenticated;
