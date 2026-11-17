-- Conversa da Identificação (pedidos da estrutura e respostas do almoxarifado).
-- Roda numa transação desfeita no final: qualquer regra quebrada interrompe
-- com "FALHOU: ...".
begin;
create temp table ids (lot uuid, item uuid, item2 uuid, pedido uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

-- Pessoa do almoxarifado (cada uma vê só os lotes dela).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'teste@scanlog.app');
insert into public.pessoas (nome, login, user_id) values ('Teste', 'teste', '00000000-0000-0000-0000-0000000000a1');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"almoxarifado"}}', true);
set local role authenticated;
insert into public.lots (id, name, created_by) select lot, 'Conversa', 'Teste' from ids;
insert into public.items (id, lot_id, ord, created_by, msg_count, pedidos_abertos)
  select item, lot, 1, 'Teste', 9, 9 from ids;
insert into public.items (id, lot_id, ord, created_by) select item2, lot, 2, 'Teste' from ids;
do $$ begin
  if (select pedidos_abertos from public.items where id = (select item from ids)) <> 0 then raise exception 'FALHOU: resumo gravado pelo cliente'; end if;
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, texto)
      select item, lot, 'almoxarifado', 'almoxarifado', 'Caio', 'texto', 'oi' from ids;
    raise exception 'FALHOU: conversou em lote não enviado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
update public.lots set status = 'enviado' where id = (select lot from ids);

-- Estrutura pede uma medida.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"estrutura"}}', true);
insert into public.item_mensagens (id, item_id, lot_id, lado, autor_papel, autor_nome, tipo, pedido, texto, situacao)
  select pedido, item, lot, 'estrutura', 'admin', 'Ana', 'pedido', 'medida', 'Diâmetro externo da rosca', 'respondido' from ids;
do $$ declare i public.items; l public.lots; m public.item_mensagens; begin
  select * into i from public.items where id = (select item from ids);
  select * into m from public.item_mensagens where id = (select pedido from ids);
  if m.situacao <> 'aberto' or m.autor_papel <> 'estrutura' then raise exception 'FALHOU: pedido %', row_to_json(m); end if;
  if i.pedidos_abertos <> 1 or i.msg_count <> 1 or i.ultima_msg_lado <> 'estrutura' then raise exception 'FALHOU: resumo do item %', row_to_json(i); end if;
  if i.ultima_msg <> 'Medida · Diâmetro externo da rosca' then raise exception 'FALHOU: prévia %', i.ultima_msg; end if;
  if i.lido_estrutura_em is null then raise exception 'FALHOU: autor não leu'; end if;
  select * into l from public.lots where id = (select lot from ids);
  if l.pedidos_abertos <> 1 or l.novas_almox <> 1 or l.novas_estrutura <> 0 then raise exception 'FALHOU: resumo do lote %', row_to_json(l); end if;
  -- Estrutura não fala pelo almoxarifado, não responde e não mexe no resumo.
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, texto)
      select item, lot, 'almoxarifado', 'estrutura', 'Ana', 'texto', 'x' from ids;
    raise exception 'FALHOU: estrutura escreveu como almoxarifado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, texto, foto)
      select item, lot, 'estrutura', 'estrutura', 'Ana', 'texto', 'x', '{"path":"originais/x.jpg"}' from ids;
    raise exception 'FALHOU: foto fora da pasta da conversa';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  update public.items set pedidos_abertos = 0, lido_almox_em = now() where id = (select item from ids);
  if (select pedidos_abertos from public.items where id = (select item from ids)) <> 1 then raise exception 'FALHOU: estrutura alterou o resumo'; end if;
  begin
    update public.lots set pedidos_abertos = 0 where id = (select lot from ids);
    if found then raise exception 'FALHOU: estrutura alterou o lote'; end if;
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Almoxarifado responde com a medida e uma foto.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"almoxarifado"}}', true);
insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, medida, unidade, texto, foto, responde_a)
  select item, lot, 'almoxarifado', 'almoxarifado', 'Caio', 'resposta', 12.50, 'mm', 'com paquímetro',
         jsonb_build_object('path', 'conversa/' || lot || '/' || item || '/a.jpg', 'width', 10, 'height', 20, 'extra', 1), pedido from ids;
do $$ declare i public.items; l public.lots; m public.item_mensagens; begin
  select * into i from public.items where id = (select item from ids);
  select * into m from public.item_mensagens where id = (select pedido from ids);
  if m.situacao <> 'respondido' or m.fechado_em is null then raise exception 'FALHOU: pedido não fechou'; end if;
  if i.pedidos_abertos <> 0 or i.msg_count <> 2 or i.ultima_msg <> '12,5 mm · Foto · com paquímetro' then raise exception 'FALHOU: resumo %', row_to_json(i); end if;
  select * into l from public.lots where id = (select lot from ids);
  if l.pedidos_abertos <> 0 or l.novas_almox <> 0 or l.novas_estrutura <> 1 then raise exception 'FALHOU: lote depois da resposta %', row_to_json(l); end if;
  if (select foto ? 'extra' from public.item_mensagens where tipo = 'resposta') then raise exception 'FALHOU: foto sem limpeza'; end if;
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, texto, responde_a)
      select item, lot, 'almoxarifado', 'almoxarifado', 'Caio', 'resposta', 'de novo', pedido from ids;
    raise exception 'FALHOU: respondeu pedido fechado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, pedido, texto)
      select item, lot, 'almoxarifado', 'almoxarifado', 'Caio', 'pedido', 'info', 'x' from ids;
    raise exception 'FALHOU: almoxarifado fez pedido';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Estrutura lê, pede foto e cancela; depois pede de novo e codifica.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"estrutura"}}', true);
select public.conversa_lida((select item from ids));
do $$ declare novo uuid; begin
  if (select novas_estrutura from public.lots where id = (select lot from ids)) <> 0 then raise exception 'FALHOU: leitura'; end if;
  insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, pedido, texto)
    select item2, lot, 'estrutura', 'estrutura', 'Ana', 'pedido', 'foto', 'Etiqueta' from ids returning id into novo;
  perform public.pedido_cancelar(novo);
  if (select pedidos_abertos from public.items where id = (select item2 from ids)) <> 0 then raise exception 'FALHOU: cancelar'; end if;
  insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, pedido, texto)
    select item2, lot, 'estrutura', 'estrutura', 'Ana', 'pedido', 'info', 'Tem marca?' from ids;
  update public.items set status = 'codificado', code = '000777', coded_by = 'Ana' where id = (select item2 from ids);
  if (select pedidos_abertos from public.items where id = (select item2 from ids)) <> 0 then raise exception 'FALHOU: pedido seguiu aberto'; end if;
  if (select situacao from public.item_mensagens where item_id = (select item2 from ids) and texto = 'Tem marca?') <> 'dispensado' then raise exception 'FALHOU: dispensar'; end if;
  if (select pedidos_abertos from public.lots where id = (select lot from ids)) <> 0 then raise exception 'FALHOU: lote dispensar'; end if;
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, pedido, texto)
      select item2, lot, 'estrutura', 'estrutura', 'Ana', 'pedido', 'info', 'x' from ids;
    raise exception 'FALHOU: pedido em item codificado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  -- Texto livre continua possível no item codificado.
  insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, texto)
    select item2, lot, 'estrutura', 'estrutura', 'Ana', 'texto', 'Era o 000777' from ids;
end $$;

-- Arquivos: os dois setores enviam, só na pasta da conversa.
do $$ declare i public.items; begin
  insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, arquivo)
    select item, lot, 'estrutura', 'estrutura', 'Ana', 'texto',
           jsonb_build_object('path', 'conversa/' || lot || '/' || item || '/d.pdf', 'nome', 'desenho.pdf', 'tamanho', 1234, 'tipo', 'application/pdf', 'x', 1) from ids;
  select * into i from public.items where id = (select item from ids);
  if i.ultima_msg <> 'Arquivo desenho.pdf' then raise exception 'FALHOU: prévia do arquivo %', i.ultima_msg; end if;
  if (select arquivo ? 'x' from public.item_mensagens where arquivo is not null) then raise exception 'FALHOU: arquivo sem limpeza'; end if;
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, arquivo)
      select item, lot, 'estrutura', 'estrutura', 'Ana', 'texto', '{"path":"originais/x.pdf","nome":"x"}' from ids;
    raise exception 'FALHOU: arquivo fora da pasta';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Confirmado: conversa encerrada para os setores.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"almoxarifado"}}', true);
update public.items set status = 'confirmado', confirmed_by = 'Caio' where id = (select item2 from ids);
do $$ begin
  begin
    insert into public.item_mensagens (item_id, lot_id, lado, autor_papel, autor_nome, tipo, texto)
      select item2, lot, 'almoxarifado', 'almoxarifado', 'Caio', 'texto', 'x' from ids;
    raise exception 'FALHOU: conversou em item confirmado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    update public.item_mensagens set texto = 'editado';
    if found then raise exception 'FALHOU: editou mensagem'; end if;
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Sem login não lê nada.
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.item_mensagens;
    raise exception 'FALHOU: anônimo leu';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Conversa ok' as resultado;
rollback;
