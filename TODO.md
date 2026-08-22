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
- [ ] Columna `status` (`visible` / `hidden`) en `altars`, default `visible`.
- [ ] Si `reported_count` supera un umbral (a definir), marcar `hidden`
      automáticamente.
- [ ] `AltarViewer` respeta `status = hidden` (muestra "no disponible").
- [ ] Vista o función simple (protegida, no anon) para listar altares
      ocultos/reportados y poder revisarlos manualmente.

## Fuera de alcance (por ahora)
- Moderación de imágenes vía API externa (modelo de visión).
- Login / cuentas de usuario / panel admin completo.
