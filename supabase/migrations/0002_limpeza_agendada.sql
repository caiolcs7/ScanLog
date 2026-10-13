-- Agenda diária da Edge Function limpeza-fotos (06:00 UTC = 03:00 em Brasília).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Segredo compartilhado entre o cron e a função, gerado aqui e guardado no Vault.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'limpeza_fotos_secret');

create function public.limpeza_secret() returns text
language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'limpeza_fotos_secret' $$;
revoke all on function public.limpeza_secret() from public, anon, authenticated;
grant execute on function public.limpeza_secret() to service_role;

select cron.schedule(
  'limpeza-fotos',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://pygedyytlcplfweibenv.supabase.co/functions/v1/limpeza-fotos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.limpeza_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
