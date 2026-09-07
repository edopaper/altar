# Altar de Muertos

Editor y visor de altares en React, Three.js y Supabase.

## Desarrollo y verificación

Configura `.env` a partir de `.env.example`, instala con `npm ci` y ejecuta `npm run dev`.

- `npm run build`: genera el catálogo y compila el frontend.
- `npm test`: valida escenas, moderación, almacenamiento y la API de compartir con Supabase simulado.
- `node scripts/test-browser.mjs`: prueba el servidor local en el puerto 5173. Acepta una URL como primer argumento para verificar `npm run preview`, por ejemplo `node scripts/test-browser.mjs http://127.0.0.1:5174`.
- Las pruebas de navegador requieren Chromium de Playwright instalado o `CHROMIUM_PATH`. Simulan las llamadas externas; no publican altares reales.
- `deno check supabase/functions/share-altar/index.ts supabase/functions/add-message/index.ts`: comprueba los tipos del servidor.

## Catálogo y validación

`npm run catalog` genera `supabase/functions/_shared/catalog.js` a partir de modelos, música y papel picado en `public/`. También se ejecuta antes de iniciar desarrollo y antes del build. Si cambias archivos mientras Vite está abierto, vuelve a ejecutar el generador.

El catálogo conserva las rutas públicas y evita volver a emitir esos archivos dentro de `dist/assets`. Cliente y servidor comparten las rutas permitidas y la validación de escenas. Al cambiar el catálogo, vuelve a desplegar la función `share-altar` junto con el frontend.

## Rendimiento y guardado

- Editor, visor, administración y diálogos se cargan por separado. Three.js y Supabase tienen archivos separados para caché; Three.js aún supera el aviso de tamaño de 500 KB de Vite.
- Calidad automática: empieza en ahorro para dispositivos táctiles y puede reducir calidad si detecta FPS bajos. También hay selección manual de ahorro o alta.
- Ahorro usa DPR 1, una sombra direccional de 1024 px y elimina las sombras puntuales. Alta limita DPR a 1.5.
- Movimiento reducido respeta la preferencia del sistema y se puede cambiar en las opciones. Desactiva órbita, almas y parpadeo; renderiza bajo demanda.
- El arrastre de grupo usa una vista previa en Three.js y confirma el estado al soltar. El guardado agrupa cambios durante 400 ms y vacía cambios pendientes al ocultar o abandonar la página. Un fallo de almacenamiento muestra un aviso con reintento.
- Los mensajes cargan páginas de 50 registros con cursor por identificador, con botones para cargar más y actualizar. Las almas muestran los mensajes cargados.

## Aplicar los cambios en producción

Los cambios del repositorio no se publican automáticamente:

1. Aplicar `supabase/015_messages_cursor_index.sql` al proyecto correspondiente. Añade el índice que utiliza la paginación por slug e identificador.
2. Regenerar el catálogo y desplegar las Edge Functions `share-altar` y `add-message`, que consumen los módulos compartidos.
3. Compilar y desplegar el frontend con las variables de entorno del proyecto.

La validación estricta rechaza escenas inválidas o modelos que ya no estén en el catálogo. Los borradores locales recuperan los objetos válidos; un altar compartido incompatible muestra un error de carga.

El build local pasó de aproximadamente 63 MB a 33 MB al eliminar copias redundantes de archivos públicos. Esta reducción corresponde al despliegue, no a una medición del tráfico inicial ni de FPS en dispositivos físicos.
