-- Espelho do Relatório dos Containers para o site do ScanLog.
-- O Relatório (Artifact do Claude) não abre em países fora da lista do Claude
-- (ex.: China). Ao abrir como dono, a página manda ao Supabase, pelo conector
-- do caio, só as partes que mudaram: 'html' (código da página com o estado
-- vazio), 's:<chave>' (partes do estado) e 'ru:<endereço>' (cada rua/andar).
-- A cópia em /ScanLog/relatorio/ lê tudo com a chave pública, só leitura.
create table if not exists public.relatorio_espelho (
  chave text primary key,
  valor text not null,
  hash text not null,
  atualizado timestamptz not null default now()
);

alter table public.relatorio_espelho enable row level security;

drop policy if exists "relatorio_espelho leitura publica" on public.relatorio_espelho;
create policy "relatorio_espelho leitura publica" on public.relatorio_espelho
  for select to anon, authenticated using (true);

revoke all on public.relatorio_espelho from anon, authenticated;
grant select on public.relatorio_espelho to anon, authenticated;
