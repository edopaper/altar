-- La policy de select existente ("altars_select_anon") solo aplica al rol
-- `anon`. Un admin logueado con GitHub usa el rol `authenticated`, que no
-- tenía ninguna policy de select y por eso el dashboard veía 0 filas.
create policy "altars_select_authenticated"
  on public.altars
  for select
  to authenticated
  using (true);
