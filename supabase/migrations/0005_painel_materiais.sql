-- Painel de Materiais: catálogo com fornecedor, preço unitário e moeda.
-- Qualquer pessoa com o link lê, sem login. Escrever só pelas funções painel_*,
-- que exigem uma sessão aberta com a senha de edição. A senha (hash bcrypt), as
-- sessões e as tentativas ficam no esquema painel_priv, fora da API.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema painel_priv;
revoke all on schema painel_priv from public, anon, authenticated;

create table painel_priv.config (
  id boolean primary key default true check (id),
  senha_hash text not null
);
-- A senha combinada não fica no repositório: entra com uma senha aleatória e
-- depois é trocada no SQL Editor com
--   update painel_priv.config set senha_hash = extensions.crypt('<senha>', extensions.gen_salt('bf', 10));
insert into painel_priv.config (senha_hash)
values (extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10)));

create table painel_priv.sessoes (
  token_hash text primary key,
  nome text not null,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '90 days'
);
create table painel_priv.tentativas (
  ip text not null,
  em timestamptz not null default now()
);
create index tentativas_ip on painel_priv.tentativas (ip, em);

create table public.painel_fornecedores (
  id bigint generated always as identity primary key,
  nome text not null check (length(btrim(nome)) between 1 and 120),
  origem text not null check (origem in ('nacional', 'internacional')),
  criado_em timestamptz not null default now(),
  criado_por text not null,
  atualizado_em timestamptz not null default now()
);
create unique index painel_fornecedores_nome on public.painel_fornecedores (lower(btrim(nome)));

create table public.painel_materiais (
  codigo text primary key check (codigo ~ '^[A-Z0-9][A-Z0-9./_-]{0,39}$'),
  descricao text check (length(descricao) <= 300),
  tipo text check (tipo in ('MP', 'PI', 'PA')),
  peso_g numeric check (peso_g > 0 and peso_g <= 1e8),
  locais text[] not null default '{}',
  fornecedor_id bigint references public.painel_fornecedores (id),
  preco numeric(16, 4) check (preco >= 0 and preco <= 1e10),
  moeda text check (moeda in ('BRL', 'USD', 'CNY')),
  quantidade numeric check (quantidade >= 0 and quantidade <= 1e10),
  origem text not null default 'manual' check (origem in ('ruas', 'manual')),
  criado_em timestamptz not null default now(),
  criado_por text not null,
  atualizado_em timestamptz,
  atualizado_por text,
  check ((preco is null) = (moeda is null))
);
create index painel_materiais_fornecedor on public.painel_materiais (fornecedor_id);

create table public.painel_historico (
  id bigint generated always as identity primary key,
  codigo text not null references public.painel_materiais (codigo) on delete cascade,
  acao text not null check (acao in ('cadastro', 'edicao', 'desfazer')),
  antes jsonb,
  depois jsonb not null,
  por text not null,
  em timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_por text
);
create index painel_historico_codigo on public.painel_historico (codigo, em desc);
create index painel_historico_em on public.painel_historico (em desc);

-- Venda em R$ por 1 unidade da moeda, do fechamento diário do Banco Central.
create table public.painel_cotacoes (
  moeda text not null check (moeda in ('USD', 'CNY')),
  data date not null,
  valor numeric(14, 6) not null check (valor > 0),
  buscado_em timestamptz not null default now(),
  primary key (moeda, data)
);

-- Leitura aberta; nenhuma escrita direta pela API.
alter table public.painel_fornecedores enable row level security;
alter table public.painel_materiais enable row level security;
alter table public.painel_historico enable row level security;
alter table public.painel_cotacoes enable row level security;
create policy "todos leem" on public.painel_fornecedores for select to anon, authenticated using (true);
create policy "todos leem" on public.painel_materiais for select to anon, authenticated using (true);
create policy "todos leem" on public.painel_historico for select to anon, authenticated using (true);
create policy "todos leem" on public.painel_cotacoes for select to anon, authenticated using (true);
revoke insert, update, delete, truncate, references, trigger
  on public.painel_fornecedores, public.painel_materiais, public.painel_historico, public.painel_cotacoes
  from anon, authenticated;

-- Atualização ao vivo para quem está com o painel aberto.
alter publication supabase_realtime add table public.painel_materiais, public.painel_fornecedores;

-- Campos que a edição altera e que o histórico guarda.
create function painel_priv.foto(m public.painel_materiais) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('descricao', m.descricao, 'tipo', m.tipo, 'peso_g', m.peso_g,
    'fornecedor_id', m.fornecedor_id, 'preco', m.preco, 'moeda', m.moeda, 'quantidade', m.quantidade)
$$;

-- Aplica as chaves presentes em d (null apaga o valor).
create function painel_priv.aplicar(m public.painel_materiais, d jsonb) returns public.painel_materiais
language plpgsql immutable set search_path = ''
as $$
begin
  if d ? 'descricao' then m.descricao := nullif(btrim(d ->> 'descricao'), ''); end if;
  if d ? 'tipo' then m.tipo := nullif(d ->> 'tipo', ''); end if;
  if d ? 'peso_g' then m.peso_g := (d ->> 'peso_g')::numeric; end if;
  if d ? 'fornecedor_id' then m.fornecedor_id := (d ->> 'fornecedor_id')::bigint; end if;
  if d ? 'preco' then m.preco := (d ->> 'preco')::numeric; end if;
  if d ? 'moeda' then m.moeda := nullif(d ->> 'moeda', ''); end if;
  if d ? 'quantidade' then m.quantidade := (d ->> 'quantidade')::numeric; end if;
  return m;
end $$;

-- Confere o token da sessão e devolve o nome de quem editou.
create function painel_priv.sessao(p_token text) returns text
language plpgsql set search_path = ''
as $$
declare
  s painel_priv.sessoes;
begin
  update painel_priv.sessoes set visto_em = now()
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and expira_em > now()
    returning * into s;
  if s is null then
    raise exception 'Sessão expirada. Digite a senha de novo.' using errcode = '28000';
  end if;
  return s.nome;
end $$;

create function public.painel_entrar(p_senha text, p_nome text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  ip text := coalesce(nullif(btrim(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), ''), '?');
  nome text := btrim(coalesce(p_nome, ''));
  token text;
begin
  if length(nome) not between 2 and 40 then
    raise exception 'Digite seu nome (2 a 40 letras).';
  end if;
  delete from painel_priv.tentativas where em < now() - interval '1 day';
  if (select count(*) from painel_priv.tentativas where tentativas.ip = painel_entrar.ip
      and em > now() - interval '15 minutes') >= 10 then
    raise exception 'Muitas tentativas. Espere 15 minutos.';
  end if;
  if not exists (select 1 from painel_priv.config
                 where senha_hash = extensions.crypt(coalesce(p_senha, ''), senha_hash)) then
    insert into painel_priv.tentativas (ip) values (painel_entrar.ip);
    raise exception 'Senha incorreta.';
  end if;
  delete from painel_priv.sessoes where expira_em < now();
  token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into painel_priv.sessoes (token_hash, nome)
    values (encode(extensions.digest(token, 'sha256'), 'hex'), nome);
  return token;
end $$;

create function public.painel_sair(p_token text) returns void
language sql security definer set search_path = ''
as $$
  delete from painel_priv.sessoes where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- Cadastra (p_novo) ou edita um material e registra no histórico.
create function public.painel_salvar(p_token text, p_codigo text, p_dados jsonb, p_novo boolean default false)
returns public.painel_materiais
language plpgsql security definer set search_path = ''
as $$
declare
  quem text := painel_priv.sessao(p_token);
  cod text := upper(btrim(coalesce(p_codigo, '')));
  atual public.painel_materiais;
  novo public.painel_materiais;
  d jsonb := coalesce(p_dados, '{}'::jsonb) - 'codigo' - 'locais' - 'origem';
begin
  if p_novo then
    if exists (select 1 from public.painel_materiais where codigo = cod) then
      raise exception 'O código % já está cadastrado.', cod;
    end if;
    novo := painel_priv.aplicar(row(cod, null, null, null, '{}', null, null, null, null, 'manual',
      now(), quem, now(), quem)::public.painel_materiais, d);
    insert into public.painel_materiais values (novo.*) returning * into novo;
    insert into public.painel_historico (codigo, acao, antes, depois, por)
      values (cod, 'cadastro', null, painel_priv.foto(novo), quem);
    return novo;
  end if;
  select * into atual from public.painel_materiais where codigo = cod for update;
  if atual is null then
    raise exception 'Código % não encontrado.', cod;
  end if;
  novo := painel_priv.aplicar(atual, d);
  if painel_priv.foto(novo) = painel_priv.foto(atual) then
    return atual;
  end if;
  update public.painel_materiais set
    descricao = novo.descricao, tipo = novo.tipo, peso_g = novo.peso_g, fornecedor_id = novo.fornecedor_id,
    preco = novo.preco, moeda = novo.moeda, quantidade = novo.quantidade,
    atualizado_em = now(), atualizado_por = quem
    where codigo = cod returning * into novo;
  insert into public.painel_historico (codigo, acao, antes, depois, por)
    values (cod, 'edicao', painel_priv.foto(atual), painel_priv.foto(novo), quem);
  return novo;
end $$;

-- Volta uma edição. Só se o material não mudou depois dela.
create function public.painel_desfazer(p_token text, p_historico bigint) returns public.painel_materiais
language plpgsql security definer set search_path = ''
as $$
declare
  quem text := painel_priv.sessao(p_token);
  h public.painel_historico;
  atual public.painel_materiais;
  novo public.painel_materiais;
begin
  select * into h from public.painel_historico where id = p_historico for update;
  if h is null then raise exception 'Registro não encontrado.'; end if;
  if h.desfeito_em is not null then raise exception 'Essa mudança já foi desfeita.'; end if;
  if h.acao = 'cadastro' then raise exception 'Um cadastro não pode ser desfeito. Edite o material.'; end if;
  select * into atual from public.painel_materiais where codigo = h.codigo for update;
  if painel_priv.foto(atual) <> h.depois then
    raise exception 'O material mudou depois disso. Desfaça a mudança mais recente primeiro.';
  end if;
  update public.painel_materiais set
    descricao = h.antes ->> 'descricao', tipo = h.antes ->> 'tipo', peso_g = (h.antes ->> 'peso_g')::numeric,
    fornecedor_id = (h.antes ->> 'fornecedor_id')::bigint, preco = (h.antes ->> 'preco')::numeric,
    moeda = h.antes ->> 'moeda', quantidade = (h.antes ->> 'quantidade')::numeric,
    atualizado_em = now(), atualizado_por = quem
    where codigo = h.codigo returning * into novo;
  update public.painel_historico set desfeito_em = now(), desfeito_por = quem where id = h.id;
  insert into public.painel_historico (codigo, acao, antes, depois, por)
    values (h.codigo, 'desfazer', painel_priv.foto(atual), painel_priv.foto(novo), quem);
  return novo;
end $$;

-- Cadastra (p_id nulo) ou corrige um fornecedor.
create function public.painel_fornecedor(p_token text, p_nome text, p_origem text, p_id bigint default null)
returns public.painel_fornecedores
language plpgsql security definer set search_path = ''
as $$
declare
  quem text := painel_priv.sessao(p_token);
  f public.painel_fornecedores;
begin
  if p_id is null then
    insert into public.painel_fornecedores (nome, origem, criado_por)
      values (btrim(p_nome), p_origem, quem) returning * into f;
  else
    update public.painel_fornecedores set nome = btrim(p_nome), origem = p_origem, atualizado_em = now()
      where id = p_id returning * into f;
    if f is null then raise exception 'Fornecedor não encontrado.'; end if;
  end if;
  return f;
exception when unique_violation then
  raise exception 'Já existe um fornecedor com esse nome.';
end $$;

-- Traz os códigos das ruas (Relatório): cria os que faltam e atualiza as
-- localizações. Descrição, tipo e peso só preenchem o que estiver vazio; preço,
-- moeda, fornecedor e quantidade nunca são tocados.
create function public.painel_importar(p_token text, p_itens jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  quem text := painel_priv.sessao(p_token);
  n int;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 5000 then
    raise exception 'Lista de códigos inválida.';
  end if;
  insert into public.painel_materiais as m (codigo, descricao, tipo, peso_g, locais, origem, criado_por)
  select upper(btrim(i.codigo)), left(nullif(btrim(i.descricao), ''), 300), i.tipo, i.peso_g,
         coalesce(i.locais, '{}'), 'ruas', quem
  from jsonb_to_recordset(p_itens) as i(codigo text, descricao text, tipo text, peso_g numeric, locais text[])
  where nullif(btrim(i.codigo), '') is not null
  on conflict (codigo) do update set
    locais = excluded.locais,
    descricao = coalesce(m.descricao, excluded.descricao),
    tipo = coalesce(m.tipo, excluded.tipo),
    peso_g = coalesce(m.peso_g, excluded.peso_g);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on all functions in schema painel_priv from public, anon, authenticated;
revoke all on function public.painel_importar(text, jsonb) from public;
grant execute on function public.painel_importar(text, jsonb) to anon, authenticated;
revoke all on function public.painel_entrar(text, text) from public;
revoke all on function public.painel_sair(text) from public;
revoke all on function public.painel_salvar(text, text, jsonb, boolean) from public;
revoke all on function public.painel_desfazer(text, bigint) from public;
revoke all on function public.painel_fornecedor(text, text, text, bigint) from public;
grant execute on function public.painel_entrar(text, text) to anon, authenticated;
grant execute on function public.painel_sair(text) to anon, authenticated;
grant execute on function public.painel_salvar(text, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.painel_desfazer(text, bigint) to anon, authenticated;
grant execute on function public.painel_fornecedor(text, text, text, bigint) to anon, authenticated;

-- Cotações: o arquivo de fechamento diário do Banco Central (todas as moedas,
-- inclusive Yuan) sai depois das 13h de Brasília em dias úteis. O cron pede o
-- arquivo do dia e, na rodada seguinte, lê a resposta guardada pelo pg_net.
create table painel_priv.cotacoes_pedidos (
  pedido bigint primary key,
  data date not null,
  em timestamptz not null default now()
);

create function painel_priv.cotacoes_ler() returns void
language plpgsql set search_path = ''
as $$
declare
  p record;
  linha text;
begin
  for p in
    select c.pedido, c.data, r.status_code, r.content
    from painel_priv.cotacoes_pedidos c join net._http_response r on r.id = c.pedido
  loop
    if p.status_code = 200 then
      for linha in select regexp_split_to_table(p.content, E'\r?\n') loop
        if split_part(linha, ';', 4) in ('USD', 'CNY') then
          insert into public.painel_cotacoes (moeda, data, valor)
          values (split_part(linha, ';', 4), to_date(split_part(linha, ';', 1), 'DD/MM/YYYY'),
                  replace(split_part(linha, ';', 6), ',', '.')::numeric)
          on conflict (moeda, data) do update set valor = excluded.valor, buscado_em = now();
        end if;
      end loop;
    end if;
    delete from painel_priv.cotacoes_pedidos where pedido = p.pedido;
  end loop;
  delete from painel_priv.cotacoes_pedidos where em < now() - interval '1 day';
end $$;

create function painel_priv.cotacoes_pedir(p_data date) returns void
language plpgsql set search_path = ''
as $$
begin
  insert into painel_priv.cotacoes_pedidos (pedido, data)
  values (net.http_get(
    url := 'https://www4.bcb.gov.br/Download/fechamento/' || to_char(p_data, 'YYYYMMDD') || '.csv',
    timeout_milliseconds := 30000), p_data);
end $$;

create function painel_priv.cotacoes() returns void
language plpgsql set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform painel_priv.cotacoes_ler();
  if extract(isodow from hoje) < 6
     and not exists (select 1 from public.painel_cotacoes where data = hoje)
     and not exists (select 1 from painel_priv.cotacoes_pedidos where data = hoje) then
    perform painel_priv.cotacoes_pedir(hoje);
  end if;
end $$;
revoke all on function painel_priv.cotacoes_ler(), painel_priv.cotacoes_pedir(date), painel_priv.cotacoes()
  from public, anon, authenticated;

-- A cada 15 minutos das 13h às 20h45 de Brasília (16h–23h45 UTC), seg a sex.
select cron.schedule('painel-cotacoes', '*/15 16-23 * * 1-5', 'select painel_priv.cotacoes()');

-- Últimos 60 dias para o gráfico (fins de semana e feriados voltam 404 e são ignorados).
select painel_priv.cotacoes_pedir(d::date)
from generate_series((now() at time zone 'America/Sao_Paulo')::date - 60,
                     (now() at time zone 'America/Sao_Paulo')::date - 1, interval '1 day') d
where extract(isodow from d) < 6;
