-- 019 agregó la columna `tribute` pero el select de 012 es por columna
-- explícita (para blindar `edit_token`), así que la API pública la rechazaba
-- con 403 hasta sumarla aquí.
grant select (tribute) on public.altars to anon, authenticated;
