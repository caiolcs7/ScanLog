-- Endurecimento: funções internas fora da API pública e fotos só nas pastas do app.
revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;
revoke all on function public.items_guard() from public, anon, authenticated;
revoke all on function public.lots_guard() from public, anon, authenticated;

drop policy "almoxarifado envia fotos" on storage.objects;
create policy "almoxarifado envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'identificacao'
              and (select public.app_role()) = 'almoxarifado'
              and (storage.foldername(name))[1] in ('originais', 'miniaturas'));
