-- Lotes que já existiam antes da migração 0014 (rodar entre a 0013 e a 0014).
insert into public.lots (id, name, created_by, created_at) values
  ('50000000-0000-0000-0000-000000000002', '  Galões rua 7  ', 'Beto', now() - interval '1 day'),
  ('50000000-0000-0000-0000-000000000001', 'Sem código 10/11', 'Ana', now() - interval '2 days');
