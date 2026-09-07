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

## Login con Google (Supabase Auth)

El frontend ya incluye login, recuperación de sesión, nombre/avatar y cierre de sesión. El editor y el visor permiten entrar con Google; el panel de administración usa GitHub y conserva sus comprobaciones de permisos.

### Configuración del proyecto alojado

1. En Google Cloud / Google Auth Platform configura la pantalla de consentimiento y crea un cliente OAuth de tipo **Aplicación web**. Si la aplicación está en modo de pruebas, añade las cuentas de prueba en Audience.
2. En **URIs de redireccionamiento autorizados** del cliente Google añade el callback que muestra Supabase en el proveedor Google. Para el proyecto referenciado en `supabase/config.toml` es `https://gqtigeuoazvedlphprzk.supabase.co/auth/v1/callback`. Verifica que sea el mismo proyecto usado por `VITE_SUPABASE_URL`.
3. En Supabase → Authentication → Sign In / Providers → Google habilita el proveedor y guarda el **Client ID** y **Client Secret** de Google. El secreto se configura allí, nunca en una variable `VITE_*`.
4. En Supabase → Authentication → URL Configuration configura **Site URL** con la URL principal de producción (o `http://localhost:5173` durante desarrollo). Añade a **Redirect URLs** las direcciones de la app desde las que haces login, con la ruta y puerto exactos: `http://localhost:5173/` y `http://127.0.0.1:5173/`. Si Vite inicia en otro puerto, como 5175, añade también `http://localhost:5175/` y/o `http://127.0.0.1:5175/`. Añade por separado tu URL de producción. No incluyas `#/` ni `#/ver/...`: la app recupera esa ruta después del login.
5. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env` y en el proveedor de hosting; recompila al cambiar estas variables. La segunda es la clave pública anon del proyecto, nunca la service_role.

El archivo `supabase/config.toml` configura el entorno local de Supabase CLI; editarlo no habilita Google automáticamente en el proyecto alojado. Para Supabase local, define las variables `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` y `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, y registra también el callback local que indique la CLI.

### Comprobación

Pulsa «Entrar con Google», elige una cuenta y verifica que vuelvas al mismo altar, que aparezca tu nombre/avatar, que la sesión se mantenga al recargar y que «Salir» cierre la sesión. Comprueba el usuario en Authentication → Users. Repite en producción.

- `provider is not enabled`: activa Google en el proyecto Supabase que usa la app.
- `redirect_uri_mismatch`: revisa el callback de **Supabase** registrado en **Google**.
- Retorno a un dominio/puerto incorrecto: revisa las URLs de la **app** registradas en **Supabase**.

Iniciar sesión permite guardar y administrar hasta tres altares desde «Mis altares». Los cambios del editor se conservan como borradores locales separados por cuenta y altar. Pulsa «Guardar altar» para sincronizarlos con Supabase; al guardar se conserva el enlace público.

Referencias: [Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google) y [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).


## Mis altares y máximo de 3 por cuenta

- Ruta `#/mis-altares`: lista propia, creación, edición y eliminación con confirmación. Los altares ocultos también cuentan para el límite.
- Migración `supabase/016_user_altars.sql`: propietario privado, tres espacios por cuenta, índice único y asignación transaccional. Las RPC `my_altars` y `delete_my_altar` usan `auth.uid()` y no aceptan un ID de propietario enviado por el cliente.
- `share-altar` verifica el JWT con `getUser`. Los altares nuevos requieren sesión. Un altar que ya tiene propietario solo puede editarlo esa cuenta; un token antiguo no evita esta comprobación.
- Los altares anónimos anteriores mantienen su enlace. Para asociar el último altar anterior a tu cuenta, inicia sesión en el navegador que lo publicó y vuelve a guardarlo: debe conservar su token de edición y la cuenta debe tener cupo. No se adjudican automáticamente altares por nombre o correo.
- Eliminar libera un espacio y borra los mensajes por cascada. La fotografía subida al bucket no se purga mediante esta RPC.
- Despliegue: aplicar primero 016 en SQL Editor o `supabase db query --linked --file supabase/016_user_altars.sql`, después `supabase functions deploy share-altar`, y publicar el frontend. La migración se aplica una sola vez.
- Prueba SQL: ejecutar `tests/user-altars.sql` entre `BEGIN` y `ROLLBACK` después de 016; verifica cupo, aislamiento, actualización y reutilización de espacios con datos temporales.
