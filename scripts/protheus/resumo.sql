-- Resumo diário da API do Protheus, pronto para a rotina só repassar.
-- Também guarda o que a página do Relatório aplicou ao se atualizar sozinha.
create table if not exists public.relatorio_api_log (
  exec bigint primary key,
  em timestamptz not null default now(),
  resumo jsonb not null
);
alter table public.relatorio_api_log enable row level security;

create or replace function public.protheus_resumo_hoje()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  e record;
  ult timestamptz;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  media numeric;
  rel record;
  lg record;
  motivos text[] := '{}';
  status text;
  linhas text[] := '{}';
  n_desc int := 0;
  x jsonb;
  k text;
  partes text[];
begin
  select * into e from protheus_execucoes order by id desc limit 1;
  if e is null then
    return jsonb_build_object('status','nao_rodou','anomalia',true,'texto','API: nenhuma leitura registrada.');
  end if;
  select max(atualizado_em) into ult from protheus_produtos where execucao = e.id;

  if (e.iniciado_em at time zone 'America/Sao_Paulo')::date < hoje then
    status := 'nao_rodou';
    motivos := motivos || 'a leitura de hoje não começou (PC desligado ou sem o usuário logado?)'::text;
  elsif e.terminado_em is null then
    if coalesce(ult, e.iniciado_em) > now() - interval '40 minutes' then
      return jsonb_build_object('status','rodando','anomalia',false,'texto','API: leitura ainda rodando.');
    end if;
    status := 'travou';
    motivos := motivos || format('a leitura parou sem fechar (%s gravados)', e.gravados);
  else
    status := 'ok';
    if coalesce(e.lidos,0) = 0 or coalesce(e.gravados,0) = 0 then
      motivos := motivos || 'a leitura terminou com 0 lidos (senha do Protheus expirada?)'::text;
    end if;
  end if;

  select avg(gravados) into media from (
    select gravados from protheus_execucoes
    where terminado_em is not null and gravados > 100000 and id <> e.id
    order by id desc limit 5) t;
  if status = 'ok' and media is not null and e.gravados < media * 0.9 then
    motivos := motivos || format('gravou %s mil, abaixo do normal (%s mil)', round(e.gravados/1000.0), round(media/1000));
  end if;

  if status = 'ok' then
    linhas := linhas || format('**API %s:** rodou certinho, fechou às %s (%s mil gravados).',
      to_char(hoje,'DD/MM'), to_char(e.terminado_em at time zone 'America/Sao_Paulo','HH24"h"MI'), round(e.gravados/1000.0));
  elsif status = 'travou' then
    linhas := linhas || format('**API %s:** parou sem fechar (%s mil gravados).', to_char(hoje,'DD/MM'), round(coalesce(e.gravados,0)/1000.0));
  else
    linhas := linhas || format('**API %s:** não rodou hoje. Última leitura em %s.', to_char(hoje,'DD/MM'),
      to_char(e.iniciado_em at time zone 'America/Sao_Paulo','DD/MM'));
  end if;

  select * into rel from protheus_relatorios where execucao = e.id order by dia desc limit 1;
  if rel is not null then
    select count(*) into n_desc from jsonb_array_elements(coalesce(rel.r->'alterados','[]')) a
      where a->'mudou' ? 'descricao';
    if n_desc > 60 then
      motivos := motivos || format('%s descritivos mudaram de uma vez', n_desc);
    end if;
    -- novos
    if (rel.r->>'novos_n')::int between 1 and 15 then
      linhas := linhas || format('- Novos (%s): %s', rel.r->>'novos_n',
        (select string_agg(n->>'codigo', ', ') from jsonb_array_elements(rel.r->'novos') n));
    else
      linhas := linhas || format('- Novos: %s', coalesce(rel.r->>'novos_n','0'));
    end if;
    -- alterados
    if (rel.r->>'alterados_n')::int between 1 and 15 then
      linhas := linhas || format('- Alterados (%s):', rel.r->>'alterados_n');
      for x in select * from jsonb_array_elements(rel.r->'alterados') loop
        partes := '{}';
        for k in select jsonb_object_keys(x->'mudou') loop
          partes := partes || format('%s %s → %s', replace(k,'_',' '),
            coalesce(x->'mudou'->k->>0,'vazio'), coalesce(x->'mudou'->k->>1,'vazio'));
        end loop;
        linhas := linhas || format('  - %s: %s', x->>'codigo', array_to_string(partes, '; '));
      end loop;
    else
      linhas := linhas || format('- Alterados: %s', coalesce(rel.r->>'alterados_n','0'));
    end if;
    linhas := linhas || format('- Removidos: %s', coalesce(rel.r->>'removidos_n','0'));
    linhas := linhas || format('- Saldos alterados: %s', coalesce(rel.r->>'saldo_alterado_n','0'));
  elsif status = 'ok' then
    linhas := linhas || '- O comparativo sai quando o Supabase terminar de calcular.'::text;
  end if;

  select * into lg from relatorio_api_log order by exec desc limit 1;
  if lg is not null then
    linhas := linhas || format('- Relatório (aplicado %s): %s descritivos, %s pesos, %s entraram, %s saíram, %s fichas.',
      to_char(lg.em at time zone 'America/Sao_Paulo','DD/MM HH24"h"MI'),
      lg.resumo->>'d', lg.resumo->>'p', lg.resumo->>'e', lg.resumo->>'s', lg.resumo->>'i');
    if lg.exec < e.id then
      linhas := linhas || '  (a leitura de hoje entra quando você abrir o Relatório)'::text;
    end if;
  end if;

  if array_length(motivos,1) > 0 then
    linhas := linhas || ('⚠️ ' || array_to_string(motivos, '; ') || '.')::text;
  end if;

  return jsonb_build_object('status', status, 'anomalia', coalesce(array_length(motivos,1),0) > 0,
    'motivos', to_jsonb(motivos), 'exec', e.id, 'texto', array_to_string(linhas, E'\n'));
end $$;
revoke all on function public.protheus_resumo_hoje() from public, anon, authenticated;
