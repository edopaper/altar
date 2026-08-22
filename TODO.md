# TODO — Sistema de moderación de contenido

Contexto: hoy compartir un altar (`share-altar` Edge Function) solo valida
rate limit por IP, tamaño de objetos y tamaño de foto. No hay ningún filtro
de contenido (nombre libre, foto libre) ni forma de reportar o dar de baja
un altar ya publicado. Vamos paso a paso.

## 1. Validar que la foto sea una imagen real
- [x] En `share-altar/index.ts`, chequear los magic bytes del archivo
      decodificado (no confiar solo en el `content-type` del data URL) antes
      de subirlo a Storage.
- [x] Rechazar (400) si no matchea la firma de PNG/JPG.

## 2. Filtro de palabras prohibidas en `name`
- [x] Armar una lista básica de términos prohibidos (ES, extensible).
- [x] Validar `name` en `share-altar/index.ts` antes del insert; si matchea,
      devolver 400 con mensaje claro.
- [x] Dejar la lista en un archivo separado fácil de editar.

## 3. Botón de reporte en el altar compartido
- [x] Columna `reported_count` (int, default 0) en `altars`.
- [x] Nueva Edge Function (o endpoint) `report-altar` que reciba `slug` e
      incremente `reported_count` (con su propio rate limit por IP para
      evitar spam de reportes).
- [x] Botón "Reportar" en `AltarViewer.jsx`, con confirmación simple.

## 4. Ocultamiento automático + revisión
- [x] Columna `status` (`visible` / `hidden`) en `altars`, default `visible`.
- [x] Si `reported_count` supera un umbral (5), marcar `hidden`
      automáticamente.
- [x] `AltarViewer` respeta `status = hidden` (muestra "no disponible").
- [x] Función simple (protegida por secreto, no anon) para listar altares
      ocultos/reportados y poder revisarlos manualmente.

## 5. Login con GitHub + dashboard de admin
- [x] OAuth App en GitHub + provider habilitado en Supabase Auth
      (`supabase/config.toml`, `[auth.external.github]`).
- [x] Tabla `admin_github_users` + función `is_admin()` (RLS) para
      restringir el acceso a tu usuario de GitHub (`edopaper`).
- [x] Policy `altars_update_admin`: un admin autenticado puede actualizar
      `altars` directo (ocultar/restaurar) sin pasar por `ADMIN_SECRET`.
- [x] Ruta `#/admin` (`AdminDashboard.jsx`): login con GitHub, lista de
      altares reportados/ocultos, botones Ocultar/Restaurar.
- [ ] (Opcional) Retirar `admin-altars` Edge Function y `ADMIN_SECRET`
      ahora que el dashboard cubre lo mismo vía RLS.

## 6. Migrar mensajes a Supabase + moderarlos desde el dashboard
- [x] Tabla `messages` (antes vivían en localStorage, ni siquiera se veían
      entre visitantes del mismo altar) con `status` visible/hidden y RLS:
      público ve solo visibles, admin ve y modera todo.
- [x] Nueva Edge Function `add-message` (mismo patrón que `share-altar`):
      valida longitud, palabras prohibidas y rate limit por IP.
- [x] `messages.js` / `MessageForm.jsx` / `AltarViewer.jsx` reescritos para
      leer/escribir contra Supabase en vez de `localStorage`.
- [x] `AltarViewer` deja que un admin logueado vea un altar oculto (con
      banner "vista de admin"), en vez de bloquearlo para todos.
- [x] Dashboard (`#/admin`): tarjetas expandibles por altar, con link "Ver
      altar", conteo y lista de mensajes, y acciones Ocultar/Restaurar/Borrar
      por mensaje.
- [x] Módulo `supabase/functions/_shared/forbidden-words.ts` compartido
      entre `share-altar` y `add-message`.

## Backlog (sin ordenar — decimos cuál sigue)
- [ ] Retirar `admin-altars` Edge Function y `ADMIN_SECRET` (obsoletos desde
      que el dashboard hace lo mismo vía RLS + login).
- [ ] Rotar el Client Secret de la OAuth App de GitHub (se pegó en el chat).
- [x] Reportar un mensaje puntual, no solo el altar completo.
- [ ] Moderación real de fotos (contenido de la imagen, no solo que sea una
      imagen válida) vía API de visión.
- [x] Housekeeping: borrar filas viejas de `share_rate_limits`,
      `report_rate_limits`, `message_rate_limits`,
      `message_report_rate_limits` (crecen sin límite).
- [ ] Aviso proactivo (email/webhook) cuando un altar se oculta
      automáticamente, en vez de depender de entrar a `#/admin`.
- [x] Paginación en el dashboard si la lista de reportados o de mensajes
      por altar crece mucho.
- [x] Compartir de nuevo el mismo altar actualiza la misma fila en vez de
      crear una nueva cada vez (bug reportado: cada "Compartir" insertaba
      un altar distinto).
- [x] Rate limits atómicos (contar+insertar en una sola sentencia SQL) en
      `share-altar`, `report-altar`, `add-message`, `report-message` — con
      pedidos muy seguidos el select de uno no veía el insert del anterior
      y se colaban de más.
- [x] Límite propio (30/hora, más laxo) para la rama de "actualizar" un
      altar ya compartido — antes no tenía ningún freno.
