-- El visor pagina por slug e id; el índice existente por fecha sigue siendo útil para administración.
create index if not exists messages_slug_id_idx on public.messages (slug, id);
