-- Permite volver a "Compartir" el mismo altar sin crear uno nuevo: cada
-- altar guarda un `edit_token` secreto generado al crearlo; el cliente lo
-- guarda en localStorage junto al slug y lo reenvía para actualizar en vez
-- de insertar.
alter table public.altars
  add column if not exists edit_token text;

-- RLS es a nivel de fila, no de columna: sin esto, cualquiera podría pedir
-- `select edit_token` directo por la API REST (la policy de select ya
-- permite leer la fila). Se revoca el select de toda la tabla para
-- anon/authenticated y se vuelve a otorgar solo en las columnas públicas.
revoke select on public.altars from anon, authenticated;

grant select (slug, name, objects, photo_url, cloth_color, status, reported_count, created_at)
  on public.altars
  to anon, authenticated;
