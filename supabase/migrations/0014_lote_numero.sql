-- Identificação: o nome do lote vem do sistema ("Lote 011"), com número que
-- nunca se repete. Quem cadastra só escreve uma observação, que dá para mudar.
-- Lotes antigos: numerados pela data de criação; o nome antigo vira observação.

create sequence public.lots_numero_seq;
alter table public.lots
  add column numero int,
  add column obs text check (length(obs) <= 200);

create function public.lote_nome(n int) returns text
language sql immutable set search_path = ''
as $$ select 'Lote ' || case when n < 1000 then lpad(n::text, 3, '0') else n::text end $$;

-- Antes do gatilho novo (que protege o nome): numera e guarda o nome antigo.
with ordem as (
  select id, row_number() over (order by created_at, id) as n from public.lots
)
update public.lots l
   set numero = ordem.n,
       obs = left(nullif(trim(l.name), ''), 200),
       name = public.lote_nome(ordem.n::int)
  from ordem
 where ordem.id = l.id;
select setval('public.lots_numero_seq', coalesce((select max(numero) from public.lots), 0) + 1, false);

alter table public.lots
  alter column numero set default nextval('public.lots_numero_seq'),
  alter column numero set not null,
  add constraint lots_numero_unico unique (numero);
alter sequence public.lots_numero_seq owned by public.lots.numero;
-- O gatilho roda como quem cadastra: precisa tirar o próximo número.
revoke all on sequence public.lots_numero_seq from anon;
grant usage, select on sequence public.lots_numero_seq to authenticated;

create or replace function public.lots_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  role text := public.app_role();
  eu uuid;
begin
  if role not in ('almoxarifado', 'admin') and current_user = 'authenticated' then
    raise exception 'Somente o almoxarifado altera lotes.';
  end if;
  new.obs := left(nullif(trim(new.obs), ''), 200);
  if tg_op = 'INSERT' then
    -- Número e nome sempre do servidor: dois aparelhos nunca repetem.
    new.numero := nextval('public.lots_numero_seq');
    new.name := public.lote_nome(new.numero);
    new.status := 'rascunho'; new.item_count := 0; new.coded_count := 0; new.confirmed_count := 0;
    new.created_at := now(); new.sent_at := null; new.coded_at := null; new.confirmed_at := null;
    if current_user = 'authenticated' and role = 'almoxarifado' then
      eu := public.minha_pessoa();
      if eu is null then raise exception 'Entre com o seu usuário para cadastrar.'; end if;
      new.dono := eu;
      new.created_by := (select p.nome from public.pessoas p where p.id = eu);
    end if;
  else
    new.numero := old.numero; new.name := old.name;
    if current_user = 'authenticated' then
      -- Só muda a observação ou envia; contadores e demais status vêm dos itens.
      if new.status <> old.status then
        if old.status = 'rascunho' and new.status = 'enviado' then
          if old.item_count = 0 then raise exception 'Cadastre ao menos um item antes de enviar.'; end if;
          new.sent_at := now();
          new.status := case
            when old.confirmed_count = old.item_count then 'confirmado'
            when old.coded_count = old.item_count then 'codificado'
            else 'enviado' end;
        else
          raise exception 'Mudança de status inválida.';
        end if;
      end if;
      new.item_count := old.item_count; new.coded_count := old.coded_count; new.confirmed_count := old.confirmed_count;
      new.created_at := old.created_at; new.created_by := old.created_by;
      new.coded_at := old.coded_at; new.confirmed_at := old.confirmed_at;
      if role <> 'admin' then new.dono := old.dono; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.lots_guard() from public, anon, authenticated;
