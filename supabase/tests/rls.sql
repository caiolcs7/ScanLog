-- Regras de acesso da Identificação. Roda numa transação desfeita no final:
-- qualquer regra quebrada interrompe com "FALHOU: ...".
begin;
create temp table ids (lot uuid, item uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values (gen_random_uuid(), gen_random_uuid());

-- Almoxarifado cria lote e item; a numeração vem do servidor.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"almoxarifado"}}', true);
set local role authenticated;
insert into public.lots (id, name, created_by) select lot, 'Teste RLS', 'Teste' from ids;
insert into public.items (id, lot_id, ord, created_by, address, photos, thumb_path)
  select item, lot, 99, 'Teste', 'R07A1C01DP01', '[{"path":"originais/x.jpg","width":1,"height":1}]', 'miniaturas/x.webp' from ids;
do $$ begin
  if (select ord from public.items where id = (select item from ids)) <> 1 then raise exception 'FALHOU: ord'; end if;
  update public.items set code = 'X' where id = (select item from ids);
  if (select code from public.items where id = (select item from ids)) is not null then raise exception 'FALHOU: almoxarifado gravou código'; end if;
  begin
    update public.items set code = 'X', status = 'codificado' where id = (select item from ids);
    raise exception 'FALHOU: almoxarifado codificou';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Estrutura não vê lote em cadastro.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"estrutura"}}', true);
do $$ begin
  if exists (select 1 from public.lots where id = (select lot from ids)) then raise exception 'FALHOU: estrutura viu rascunho'; end if;
end $$;

select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"almoxarifado"}}', true);
update public.lots set status = 'enviado' where id = (select lot from ids);

-- Estrutura só altera o código.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"estrutura"}}', true);
do $$ begin
  begin
    update public.items set address = 'OUTRO' where id = (select item from ids);
    raise exception 'FALHOU: estrutura alterou endereço';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    delete from public.items where id = (select item from ids);
    if found then raise exception 'FALHOU: estrutura apagou item'; end if;
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    update public.lots set name = 'x' where id = (select lot from ids);
    if found then raise exception 'FALHOU: estrutura renomeou lote'; end if;
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  update public.items set status = 'codificado', code = '000123', coded_by = 'Ana' where id = (select item from ids);
  if (select status from public.lots where id = (select lot from ids)) <> 'codificado' then raise exception 'FALHOU: lote não ficou codificado'; end if;
end $$;

-- Almoxarifado confirma; a miniatura ganha prazo de 150 dias e os originais podem sair.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"almoxarifado"}}', true);
update public.items set status = 'confirmado', confirmed_by = 'Caio' where id = (select item from ids);
update public.items set photos = '[]' where id = (select item from ids);
do $$ declare r public.items; begin
  select * into r from public.items where id = (select item from ids);
  if r.code <> '000123' then raise exception 'FALHOU: código perdido'; end if;
  if r.thumb_expires_at::date <> (now() + interval '150 days')::date then raise exception 'FALHOU: prazo da miniatura'; end if;
  if r.photos_deleted_at is null or r.photos <> '[]' then raise exception 'FALHOU: originais'; end if;
  if (select status from public.lots where id = r.lot_id) <> 'confirmado' then raise exception 'FALHOU: lote não confirmado'; end if;
  begin
    update public.items set code = 'Y', status = 'pendente' where id = r.id;
    raise exception 'FALHOU: item confirmado foi alterado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    delete from public.items where id = r.id;
    if found then raise exception 'FALHOU: confirmado apagado'; end if;
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Sem setor, nada.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{}}', true);
do $$ begin
  if exists (select 1 from public.items) then raise exception 'FALHOU: sem setor leu itens'; end if;
  begin
    insert into public.lots (name, created_by) values ('x', 'x');
    raise exception 'FALHOU: sem setor criou lote';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
reset role;
select 'RLS ok' as resultado;
rollback;
