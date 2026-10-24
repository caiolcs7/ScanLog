-- Painel de Materiais: cada código pode ter até 2 fornecedores, cada um com
-- o seu preço e moeda (ex.: o fabricante importado e o nacional). O
-- "fornecedor 1" continua nas colunas de sempre (fornecedor_id, preco, moeda);
-- o "fornecedor 2" é novo (fornecedor2_id, preco2, moeda2). A quantidade é uma
-- só. O 2 só existe se o 1 existe (a tela move o 2 para o 1 se o 1 for limpo).

alter table public.painel_materiais
  add column fornecedor2_id bigint references public.painel_fornecedores (id),
  add column preco2 numeric(16, 4) check (preco2 >= 0 and preco2 <= 1e10),
  add column moeda2 text check (moeda2 in ('BRL', 'USD', 'CNY')),
  add constraint painel_materiais_oferta2 check ((preco2 is null) = (moeda2 is null)),
  add constraint painel_materiais_segundo check (
    (fornecedor2_id is null and preco2 is null) or fornecedor_id is not null or preco is not null),
  add constraint painel_materiais_dois_distintos check (fornecedor2_id is null or fornecedor2_id <> fornecedor_id);
create index painel_materiais_fornecedor2 on public.painel_materiais (fornecedor2_id);

-- Campos que a edição altera e que o histórico guarda.
create or replace function painel_priv.foto(m public.painel_materiais) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('descricao', m.descricao, 'tipo', m.tipo, 'peso_g', m.peso_g,
    'fornecedor_id', m.fornecedor_id, 'preco', m.preco, 'moeda', m.moeda,
    'fornecedor2_id', m.fornecedor2_id, 'preco2', m.preco2, 'moeda2', m.moeda2,
    'quantidade', m.quantidade)
$$;

-- Aplica as chaves presentes em d (null apaga o valor).
create or replace function painel_priv.aplicar(m public.painel_materiais, d jsonb) returns public.painel_materiais
language plpgsql immutable set search_path = ''
as $$
begin
  if d ? 'descricao' then m.descricao := nullif(btrim(d ->> 'descricao'), ''); end if;
  if d ? 'tipo' then m.tipo := nullif(d ->> 'tipo', ''); end if;
  if d ? 'peso_g' then m.peso_g := (d ->> 'peso_g')::numeric; end if;
  if d ? 'fornecedor_id' then m.fornecedor_id := (d ->> 'fornecedor_id')::bigint; end if;
  if d ? 'preco' then m.preco := (d ->> 'preco')::numeric; end if;
  if d ? 'moeda' then m.moeda := nullif(d ->> 'moeda', ''); end if;
  if d ? 'fornecedor2_id' then m.fornecedor2_id := (d ->> 'fornecedor2_id')::bigint; end if;
  if d ? 'preco2' then m.preco2 := (d ->> 'preco2')::numeric; end if;
  if d ? 'moeda2' then m.moeda2 := nullif(d ->> 'moeda2', ''); end if;
  if d ? 'quantidade' then m.quantidade := (d ->> 'quantidade')::numeric; end if;
  return m;
end $$;

-- Cadastra (p_novo) ou edita um material e registra no histórico.
create or replace function public.painel_salvar(p_token text, p_codigo text, p_dados jsonb, p_novo boolean default false)
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
      now(), quem, now(), quem, null, null, null)::public.painel_materiais, d);
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
    descricao = novo.descricao, tipo = novo.tipo, peso_g = novo.peso_g,
    fornecedor_id = novo.fornecedor_id, preco = novo.preco, moeda = novo.moeda,
    fornecedor2_id = novo.fornecedor2_id, preco2 = novo.preco2, moeda2 = novo.moeda2,
    quantidade = novo.quantidade,
    atualizado_em = now(), atualizado_por = quem
    where codigo = cod returning * into novo;
  insert into public.painel_historico (codigo, acao, antes, depois, por)
    values (cod, 'edicao', painel_priv.foto(atual), painel_priv.foto(novo), quem);
  return novo;
end $$;

-- Volta uma edição. Só se o material não mudou depois dela.
create or replace function public.painel_desfazer(p_token text, p_historico bigint) returns public.painel_materiais
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
  -- registros antigos não têm as chaves do fornecedor 2: contam como vazias
  if painel_priv.foto(atual) <> (jsonb_build_object('fornecedor2_id', null, 'preco2', null, 'moeda2', null) || h.depois) then
    raise exception 'O material mudou depois disso. Desfaça a mudança mais recente primeiro.';
  end if;
  update public.painel_materiais set
    descricao = h.antes ->> 'descricao', tipo = h.antes ->> 'tipo', peso_g = (h.antes ->> 'peso_g')::numeric,
    fornecedor_id = (h.antes ->> 'fornecedor_id')::bigint, preco = (h.antes ->> 'preco')::numeric,
    moeda = h.antes ->> 'moeda',
    fornecedor2_id = (h.antes ->> 'fornecedor2_id')::bigint, preco2 = (h.antes ->> 'preco2')::numeric,
    moeda2 = h.antes ->> 'moeda2',
    quantidade = (h.antes ->> 'quantidade')::numeric,
    atualizado_em = now(), atualizado_por = quem
    where codigo = h.codigo returning * into novo;
  update public.painel_historico set desfeito_em = now(), desfeito_por = quem where id = h.id;
  insert into public.painel_historico (codigo, acao, antes, depois, por)
    values (h.codigo, 'desfazer', painel_priv.foto(atual), painel_priv.foto(novo), quem);
  return novo;
end $$;

-- Carga das ruas: cria os códigos que faltam e atualiza as localizações.
-- Descrição, tipo e peso só preenchem o que estiver vazio. O item pode trazer
-- fornecedor / forn_origem e fornecedor2 / forn2_origem ('nacional' ou
-- 'internacional'): o fornecedor é criado se não existir (sem diferenciar
-- maiúsculas) e só é aplicado a quem nunca foi editado no painel; o que alguém
-- mexeu não é sobrescrito. Preço, moeda e quantidade nunca são tocados.
create or replace function public.painel_importar(p_token text, p_itens jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  quem text := painel_priv.sessao(p_token);
  n int;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 5000 then
    raise exception 'Lista de códigos inválida.';
  end if;

  insert into public.painel_fornecedores (nome, origem, criado_por)
  select distinct on (lower(btrim(f.nome))) left(btrim(f.nome), 120), f.origem, quem
  from (
    select i.fornecedor as nome, i.forn_origem as origem
      from jsonb_to_recordset(p_itens) as i(fornecedor text, forn_origem text)
    union all
    select i.fornecedor2, i.forn2_origem
      from jsonb_to_recordset(p_itens) as i(fornecedor2 text, forn2_origem text)
  ) f
  where nullif(btrim(f.nome), '') is not null
    and f.origem in ('nacional', 'internacional')
    and not exists (
      select 1 from public.painel_fornecedores x
      where lower(btrim(x.nome)) = lower(btrim(left(btrim(f.nome), 120)))
    )
  order by lower(btrim(f.nome));

  insert into public.painel_materiais as m (codigo, descricao, tipo, peso_g, locais, fornecedor_id, fornecedor2_id, origem, criado_por)
  select upper(btrim(i.codigo)), left(nullif(btrim(i.descricao), ''), 300), i.tipo, i.peso_g,
         coalesce(i.locais, '{}'), f1.id, case when f1.id is not null then f2.id end, 'ruas', quem
  from jsonb_to_recordset(p_itens) as i(codigo text, descricao text, tipo text, peso_g numeric, locais text[],
                                         fornecedor text, fornecedor2 text)
  left join public.painel_fornecedores f1 on lower(btrim(f1.nome)) = lower(btrim(left(btrim(i.fornecedor), 120)))
  left join public.painel_fornecedores f2 on lower(btrim(f2.nome)) = lower(btrim(left(btrim(i.fornecedor2), 120)))
                                          and f2.id is distinct from f1.id
  where nullif(btrim(i.codigo), '') is not null
  on conflict (codigo) do update set
    locais = excluded.locais,
    descricao = coalesce(m.descricao, excluded.descricao),
    tipo = coalesce(m.tipo, excluded.tipo),
    peso_g = coalesce(m.peso_g, excluded.peso_g),
    fornecedor_id = case when m.atualizado_em is null then excluded.fornecedor_id else m.fornecedor_id end,
    fornecedor2_id = case when m.atualizado_em is null then excluded.fornecedor2_id else m.fornecedor2_id end;
  get diagnostics n = row_count;
  return n;
end $$;
