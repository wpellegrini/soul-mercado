-- =====================================================================
-- Soul Mercado: fotos dos produtos (Supabase Storage)
-- Execute depois do 0001_mercado.sql.
-- Bucket público: as fotos aparecem no PDV sem login extra.
-- Só estoque e admin enviam, trocam ou apagam fotos.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Estoque envia fotos de produtos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.can_stock());

create policy "Estoque troca fotos de produtos"
  on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.can_stock())
  with check (bucket_id = 'produtos' and public.can_stock());

create policy "Estoque apaga fotos de produtos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.can_stock());
