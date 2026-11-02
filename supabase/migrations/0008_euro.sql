-- Euro como moeda do Painel: preço (moeda, moeda2) e cotação do Banco Central.

alter table public.painel_materiais drop constraint painel_materiais_moeda_check;
alter table public.painel_materiais
  add constraint painel_materiais_moeda_check check (moeda in ('BRL', 'USD', 'CNY', 'EUR'));
alter table public.painel_materiais drop constraint painel_materiais_moeda2_check;
alter table public.painel_materiais
  add constraint painel_materiais_moeda2_check check (moeda2 in ('BRL', 'USD', 'CNY', 'EUR'));
alter table public.painel_cotacoes drop constraint painel_cotacoes_moeda_check;
alter table public.painel_cotacoes
  add constraint painel_cotacoes_moeda_check check (moeda in ('USD', 'CNY', 'EUR'));

create or replace function painel_priv.cotacoes_ler() returns void
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
        if split_part(linha, ';', 4) in ('USD', 'CNY', 'EUR') then
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
revoke all on function painel_priv.cotacoes_ler() from public, anon, authenticated;

-- Euro dos últimos 60 dias e de hoje (fins de semana, feriados e dias ainda sem
-- fechamento voltam 404 e são ignorados). O cron existente lê as respostas.
select painel_priv.cotacoes_pedir(d::date)
from generate_series((now() at time zone 'America/Sao_Paulo')::date - 60,
                     (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
where extract(isodow from d) < 6;
