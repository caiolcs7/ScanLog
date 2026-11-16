-- Identificação: arquivos na conversa do item (PDF, planilha, desenho etc.),
-- para os dois setores. Fotos continuam como antes (coluna foto).
-- O arquivo fica em conversa/<lote>/<item>/ e sai junto com as fotos quando o
-- item é confirmado.

alter table public.item_mensagens
  add column arquivo jsonb check (arquivo is null or jsonb_typeof(arquivo) = 'object');

-- Mensagem agora pode ser só um arquivo.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.item_mensagens'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%foto IS NOT NULL%'
  loop
    execute format('alter table public.item_mensagens drop constraint %I', c);
  end loop;
end $$;
alter table public.item_mensagens add constraint item_mensagens_conteudo
  check (coalesce(length(trim(texto)), 0) > 0 or medida is not null or foto is not null or arquivo is not null);

-- Valida o arquivo depois das regras gerais (mensagens_guard já fixou o lote).
create function public.mensagens_guard_arquivo() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or new.arquivo is null then return new; end if;
  if coalesce(new.arquivo ->> 'path', '') not like 'conversa/' || new.lot_id || '/' || new.item_id || '/%'
     or (new.arquivo ->> 'path') like '%..%' then
    raise exception 'Arquivo inválido.';
  end if;
  new.arquivo := jsonb_build_object(
    'path', new.arquivo ->> 'path',
    'nome', left(coalesce(nullif(trim(new.arquivo ->> 'nome'), ''), 'arquivo'), 120),
    'tamanho', greatest(coalesce((new.arquivo ->> 'tamanho')::bigint, 0), 0),
    'tipo', left(coalesce(new.arquivo ->> 'tipo', ''), 100));
  return new;
end $$;
revoke all on function public.mensagens_guard_arquivo() from public, anon, authenticated;
create trigger mensagens_guard_arquivo before insert on public.item_mensagens
for each row execute function public.mensagens_guard_arquivo();

create or replace function public.mensagem_previa(m public.item_mensagens) returns text
language sql immutable set search_path = ''
as $$
  select left(concat_ws(' · ',
    case m.pedido when 'medida' then 'Medida' when 'foto' then 'Foto' when 'info' then 'Pergunta' end,
    case when m.medida is not null
         then replace(trim_scale(m.medida)::text, '.', ',') || ' ' || m.unidade end,
    case when m.foto is not null and m.tipo <> 'pedido' then 'Foto' end,
    case when m.arquivo is not null then 'Arquivo ' || (m.arquivo ->> 'nome') end,
    m.texto), 160)
$$;
revoke all on function public.mensagem_previa(public.item_mensagens) from public, anon, authenticated;

-- Bucket: aceita documentos comuns além das fotos, até 20 MB.
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array[
         'image/jpeg', 'image/webp', 'image/png', 'image/gif', 'image/heic', 'image/heif',
         'application/pdf', 'text/plain', 'text/csv',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/zip', 'application/x-zip-compressed',
         'application/octet-stream']
 where id = 'identificacao';
