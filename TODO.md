# TODO — Migrar "Compartir altar" a Supabase

Contexto: hoy `shareAltar` (App.jsx) llama a `saveSharedAltar` (storage.js), que
guarda el altar en `localStorage`. El link que se copia solo funciona en el
mismo navegador donde se creó — no sirve para compartir de verdad. Este es el
problema a resolver. Sin login: crear y ver altares queda público y anónimo,
como hoy.

## 1. Setup de Supabase
- [x] Crear proyecto en Supabase.
- [x] Guardar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `.env` (y `.env.example`
      sin valores reales).
- [x] Instalar `@supabase/supabase-js`.
- [x] Crear `src/supabaseClient.js` con el cliente inicializado.

## 2. Tabla `altars`
- [x] Columnas: `slug` (text, PK), `name`, `objects` (jsonb), `photo_url`
      (text, nullable), `cloth_color`, `created_at` (default now()).
- [x] RLS activado:
  - `insert`: público (anon) permitido.
  - `select`: público (anon) permitido, solo lectura.
  - Sin `update`/`delete` para anon (un altar compartido no se debería poder
    pisar desde el link de otra persona).
- [x] Índice único en `slug` (PK ya lo cubre).

## 3. Fotos a Supabase Storage (en vez de base64 en la fila)
- [x] Crear bucket público `altar-photos`.
- [x] Al compartir: si hay `photo` (data URL en memoria), subirla al bucket
      con el `slug` como nombre de archivo, guardar la URL pública en
      `photo_url`.
- [x] El editor local (autoguardado) sigue igual, en `localStorage` — esto
      solo aplica al momento de compartir.

## 4. Reemplazar storage.js
- [x] `saveSharedAltar` → `insert` en `altars` + subida de foto si aplica.
- [x] `loadSharedAltar` → `select` por `slug` en vez de leer `localStorage`.
- [x] Mantener la misma firma/contrato para no tocar `App.jsx` /
      `AltarViewer.jsx` más de lo necesario (ahora async, mismo shape de
      datos).
- [x] Manejar estados de carga/error en `AltarViewer` (loading/missing/error).

## 5. Guardarraíles (sin login, sin control por IP)
- [x] Límite de tamaño en `objects` (ya existe MAX_OBJECTS = 150 en App.jsx,
      revisar que el jsonb resultante sea razonable).
- [x] Confirmar límite de foto (5 MB) sigue teniendo sentido subiendo a
      Storage en vez de inline.
- [ ] (Opcional, solo si hay abuso real) Rate limit por IP vía Edge Function.
- [ ] (Opcional) Job/expiración: borrar altares no vistos en X días para no
      crecer sin límite.

## 6. Pruebas
- [x] Compartir un altar desde un navegador, abrirlo en otro dispositivo/
      navegador distinto y confirmar que carga.
- [x] Confirmar que un slug inexistente muestra el estado "no encontrado" ya
      existente en AltarViewer.
- [x] Confirmar que la foto se ve correctamente vía `photo_url`.

## Fuera de alcance (por ahora)
- Login / cuentas de usuario.
- "Mis altares" / edición de un altar ya compartido.
- Rate limiting proactivo (solo si se vuelve necesario).
