-- Lotes por pessoa no almoxarifado. Roda numa transação desfeita no final:
-- qualquer regra quebrada interrompe com "FALHOU: ...".
begin;
-- Contas: Ana e Beto (pessoas), conta compartilhada e uma sessão antiga dela.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@scanlog.app'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@scanlog.app'),
  ('00000000-0000-0000-0000-0000000000cc', 'almoxarifado@scanlog.app');
insert into public.pessoas (id, nome, login, user_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Ana Souza', 'ana', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 'Beto', 'beto', '00000000-0000-0000-0000-00000000000b');

-- Lotes antigos ganham dono pelo nome, sem diferença de acento ou maiúscula.
insert into public.lots (id, name, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'Lote Ana', 'ana  souza'),
  ('20000000-0000-0000-0000-00000000000b', 'Lote Beto', 'Beto'),
  ('20000000-0000-0000-0000-0000000000dd', 'Lote Ilídio', 'Ilídio Nascimento Alves');
insert into public.items (id, lot_id, ord, created_by) values
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 1, 'Beto');
insert into storage.objects (bucket_id, name) values
  ('identificacao', 'originais/20000000-0000-0000-0000-00000000000a/x/1.jpg'),
  ('identificacao', 'originais/20000000-0000-0000-0000-00000000000b/x/1.jpg');
do $$ begin
  if public.pessoas_semear() <> 3 then raise exception 'FALHOU: semear'; end if;
  if (select dono from public.lots where name = 'Lote Ana') <> '10000000-0000-0000-0000-00000000000a' then raise exception 'FALHOU: dono Ana'; end if;
  if (select p.login from public.lots l join public.pessoas p on p.id = l.dono where l.name = 'Lote Ilídio') <> 'ilidio' then raise exception 'FALHOU: login criado'; end if;
  if public.pessoas_semear() <> 0 then raise exception 'FALHOU: semear de novo'; end if;
end $$;

-- Ana só vê e mexe nos lotes dela.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000000a","app_metadata":{"role":"almoxarifado"}}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.lots) <> 1 then raise exception 'FALHOU: Ana vê % lotes', (select count(*) from public.lots); end if;
  if exists (select 1 from public.items) then raise exception 'FALHOU: Ana viu item do Beto'; end if;
  if (select count(*) from storage.objects) <> 1 then raise exception 'FALHOU: Ana vê fotos de outro'; end if;
  if (select count(*) from public.pessoas) <> 1 then raise exception 'FALHOU: Ana vê outras pessoas'; end if;
  update public.lots set name = 'x' where id = '20000000-0000-0000-0000-00000000000b';
  if found then raise exception 'FALHOU: Ana renomeou lote do Beto'; end if;
  delete from public.lots where id = '20000000-0000-0000-0000-00000000000b';
  if found then raise exception 'FALHOU: Ana excluiu lote do Beto'; end if;
  begin
    insert into public.items (lot_id, ord, created_by) values ('20000000-0000-0000-0000-00000000000b', 1, 'Ana');
    raise exception 'FALHOU: Ana pôs item no lote do Beto';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    insert into storage.objects (bucket_id, name) values ('identificacao', 'originais/20000000-0000-0000-0000-00000000000b/y/1.jpg');
    raise exception 'FALHOU: Ana enviou foto no lote do Beto';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    insert into public.pessoas (nome, login) values ('Zé', 'ze');
    raise exception 'FALHOU: Ana cadastrou pessoa';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    perform public.pessoas_para_migrar(gen_random_uuid(), gen_random_uuid(), 'Ana');
    raise exception 'FALHOU: Ana chamou a migração';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
-- Lote novo: dono e nome vêm da conta, não do aparelho.
insert into public.lots (id, name, created_by, dono) values
  ('20000000-0000-0000-0000-0000000000a2', 'Novo', 'Outro nome', '10000000-0000-0000-0000-00000000000b');
insert into public.items (lot_id, ord, created_by) values ('20000000-0000-0000-0000-0000000000a2', 1, 'Ana');
insert into storage.objects (bucket_id, name) values ('identificacao', 'originais/20000000-0000-0000-0000-0000000000a2/y/1.jpg');
do $$ begin
  if (select (dono, created_by) from public.lots where id = '20000000-0000-0000-0000-0000000000a2')
     is distinct from ('10000000-0000-0000-0000-00000000000a'::uuid, 'Ana Souza'::text) then
    raise exception 'FALHOU: dono do lote novo';
  end if;
  update public.lots set dono = '10000000-0000-0000-0000-00000000000b' where id = '20000000-0000-0000-0000-0000000000a2';
  if (select dono from public.lots where id = '20000000-0000-0000-0000-0000000000a2') <> '10000000-0000-0000-0000-00000000000a' then
    raise exception 'FALHOU: Ana passou o lote';
  end if;
end $$;

-- Conta compartilhada (sem pessoa) não vê nem cadastra nada.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000cc","app_metadata":{"role":"almoxarifado"}}', true);
do $$ begin
  if exists (select 1 from public.lots) then raise exception 'FALHOU: conta compartilhada viu lotes'; end if;
  begin
    insert into public.lots (name, created_by) values ('x', 'x');
    raise exception 'FALHOU: conta compartilhada cadastrou';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

-- Estrutura vê só enviados, de todos; administrador vê tudo e troca o dono.
reset role;
update public.lots set status = 'enviado' where id = '20000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"estrutura"}}', true);
do $$ begin
  if (select count(*) from public.lots) <> 1 then raise exception 'FALHOU: estrutura vê % lotes', (select count(*) from public.lots); end if;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
do $$ begin
  if (select count(*) from public.lots) <> 4 then raise exception 'FALHOU: admin vê % lotes', (select count(*) from public.lots); end if;
  if (select count(*) from public.pessoas) <> 3 then raise exception 'FALHOU: admin não vê as pessoas'; end if;
  update public.lots set dono = '10000000-0000-0000-0000-00000000000b' where id = '20000000-0000-0000-0000-0000000000a2';
  if (select dono from public.lots where id = '20000000-0000-0000-0000-0000000000a2') <> '10000000-0000-0000-0000-00000000000b' then
    raise exception 'FALHOU: admin não trocou o dono';
  end if;
end $$;

-- Pessoa desativada não vê mais nada.
reset role;
update public.pessoas set ativo = false where login = 'beto';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000000b","app_metadata":{"role":"almoxarifado"}}', true);
do $$ begin
  if exists (select 1 from public.lots) then raise exception 'FALHOU: pessoa desativada viu lotes'; end if;
end $$;

-- Troca automática: sessão antiga da conta compartilhada, sempre para a mesma pessoa.
reset role;
update public.pessoas_migracao set inicio = now() - interval '1 day';
insert into auth.sessions (id, user_id, created_at) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000cc', now() - interval '2 days'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000cc', now() - interval '2 days'),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000cc', now()),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', now() - interval '2 days');
set local role service_role;
do $$
declare r record;
begin
  select * into r from public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000001', ' ilidio nascimento  alves ');
  if r.login <> 'ilidio' or r.user_id is not null then raise exception 'FALHOU: migração achou %', row_to_json(r); end if;
  begin
    perform public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000001', 'Ilídio Nascimento Alves');
    perform public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000001', 'Ana Souza');
    raise exception 'FALHOU: mesma sessão migrou para outra pessoa';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    perform public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000003', 'Ana Souza');
    raise exception 'FALHOU: sessão nova migrou';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    perform public.pessoas_para_migrar('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000004', 'Ana Souza');
    raise exception 'FALHOU: outra conta migrou';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin
    perform public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000002', 'Beto');
    raise exception 'FALHOU: pessoa desativada migrou';
  exception when others then if sqlerrm <> 'sem_pessoa' then raise; end if; end;
  select * into r from public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000001', 'Ilídio Nascimento Alves');
  if r.login <> 'ilidio' then raise exception 'FALHOU: repetir a troca'; end if;
  if public.pessoas_conta_por_email('ANA@scanlog.app') <> '00000000-0000-0000-0000-00000000000a' then raise exception 'FALHOU: conta por e-mail'; end if;
end $$;
reset role;
update public.pessoas_migracao set inicio = now() - interval '46 days';
set local role service_role;
do $$ begin
  begin
    perform public.pessoas_para_migrar('00000000-0000-0000-0000-0000000000cc', '40000000-0000-0000-0000-000000000002', 'Ana Souza');
    raise exception 'FALHOU: migração depois do prazo';
  exception when others then if sqlerrm <> 'migracao_encerrada' then raise; end if; end;
end $$;
rollback;
