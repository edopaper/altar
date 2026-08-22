-- Políticas RLS para el bucket "altar-photos".
-- El bucket ya es público (lectura libre), esto habilita la subida (insert)
-- para el rol anon. No se permite update/delete desde el cliente.

create policy "altar_photos_insert_anon"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'altar-photos');

-- Sin políticas de update/delete para anon => quedan bloqueadas por RLS.
