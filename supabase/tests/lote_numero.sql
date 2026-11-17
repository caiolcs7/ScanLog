-- Nome automático do lote ("Lote 011") e observação. Roda numa transação
-- desfeita no final; espera os lotes de lote_numero_antes.sql.
begin;
do $$ begin
  if (select (numero, name, obs) from public.lots where id = '50000000-0000-0000-0000-000000000001')
     is distinct from (1, 'Lote 001'::text, 'Sem código 10/11'::text) then raise exception 'FALHOU: lote antigo 1'; end if;
  if (select (numero, name, obs) from public.lots where id = '50000000-0000-0000-0000-000000000002')
     is distinct from (2, 'Lote 002'::text, 'Galões rua 7'::text) then raise exception 'FALHOU: lote antigo 2'; end if;
  if public.lote_nome(1234) <> 'Lote 1234' then raise exception 'FALHOU: número grande'; end if;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'teste@scanlog.app');
insert into public.pessoas (nome, login, user_id) values ('Teste', 'teste', '00000000-0000-0000-0000-0000000000a1');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"almoxarifado"}}', true);
set local role authenticated;
-- O aparelho manda qualquer nome e número: valem os do servidor.
insert into public.lots (id, name, numero, obs, created_by) values
  ('60000000-0000-0000-0000-000000000001', 'Meu nome', 99, '  peças da rua 3 ', 'x');
insert into public.lots (id, name, obs, created_by) values
  ('60000000-0000-0000-0000-000000000002', 'Lote', '   ', 'x');
-- Reenvio do mesmo lote (fila offline) não muda número nem nome.
insert into public.lots (id, name, obs, created_by) values
  ('60000000-0000-0000-0000-000000000001', 'Outro', 'peças da rua 3', 'x')
  on conflict (id) do update set name = excluded.name, obs = excluded.obs;
do $$ begin
  if (select (numero, name, obs) from public.lots where id = '60000000-0000-0000-0000-000000000001')
     is distinct from (3, 'Lote 003'::text, 'peças da rua 3'::text) then
    raise exception 'FALHOU: lote novo %', (select row_to_json(l) from public.lots l where id = '60000000-0000-0000-0000-000000000001');
  end if;
  if (select (numero, obs) from public.lots where id = '60000000-0000-0000-0000-000000000002')
     is distinct from (5, null::text) then
    raise exception 'FALHOU: segundo lote %', (select row_to_json(l) from public.lots l where id = '60000000-0000-0000-0000-000000000002');
  end if;
  -- Observação muda; nome e número não.
  update public.lots set obs = 'rua 4', name = 'x', numero = 1 where id = '60000000-0000-0000-0000-000000000001';
  if (select (numero, name, obs) from public.lots where id = '60000000-0000-0000-0000-000000000001')
     is distinct from (3, 'Lote 003'::text, 'rua 4'::text) then raise exception 'FALHOU: editar observação'; end if;
end $$;
rollback;
