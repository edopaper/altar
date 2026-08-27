# TODO — UI/UX para quien arma su altar

Contexto: mejoras de experiencia para el flujo de armado del altar (menú,
viewport 3D, edición de objetos), separadas del TODO de moderación de
contenido (`TODO.md`). Vamos paso a paso, sin orden fijo salvo lo marcado
como prioridad.

## Prioridad alta (mayor impacto, menor esfuerzo)

### 1. Buscador en "Decoración"
- [x] Input de texto en `AltarMenu.jsx` que filtre modelos y papel picado
      por nombre.
- [x] ~~Auto-expandir (`open`) las categorías con match~~ Superado por el
      punto 13: ya no hay acordeones; al buscar se muestra la cuadrícula
      plana con los matches de todo el catálogo, agrupados por etiqueta.
- [x] Estado vacío ("Sin resultados para «...»") si ningún modelo matchea.

### 2. Undo (Ctrl+Z) para mover/borrar/agregar
- [x] Historial simple de snapshots de `objects` (pila acotada, ej. 20
      pasos) en `App.jsx`.
- [x] Atajo Ctrl+Z (y Ctrl+Shift+Z o Ctrl+Y para redo) además de los que ya
      existen (G/R/S/Esc).
- [x] Botones ↶/↷ en la toolbar flotante (`TransformToolbar.jsx`) para
      quien no tiene teclado (mobile) o no conoce el atajo.
- [x] Una vez que exista undo, reevaluar si "Eliminar" un objeto individual
      necesita seguir sin confirmación, o si "Limpiar altar" puede perder su
      `window.confirm` (ver punto 5). Resuelto en el punto 5.

### 3. Onboarding de primera vez
- [x] Flag en `localStorage` (mismo patrón que `STORAGE_KEY`/`PHOTO_KEY`)
      para detectar primera visita.
- [x] Modal descartable (`Onboarding.jsx`) con lo básico: mover cámara,
      agregar primer objeto, mover/rotar/escalar, Ctrl+Z, compartir.

### 4. Feedback visual al agregar un objeto
- [x] Auto-seleccionar el objeto recién agregado (ya estaba implementado
      en `addShape`/`addModel`/`addPaper`/`duplicateObject`).
- [x] Highlight/pulso breve en el objeto nuevo (`SpawnPulse` en
      `AltarObject.jsx`, disparado por `justAddedId` en `App.jsx`), por si
      queda fuera de cuadro o detrás de otro.

## Prioridad media

### 5. Confirmaciones consistentes al eliminar
- [x] Decidir una sola política para "Eliminar objeto" vs "Limpiar altar":
      ninguna acción pide confirmación bloqueante; todo pasa por el
      historial de Ctrl+Z.
- [x] "Limpiar altar" ya no usa `confirm()`: limpia al instante y muestra
      un toast con botón "Deshacer" (Toast.jsx ahora soporta una acción
      opcional).

### 6. Duplicar con offset visible
- [x] `duplicateObject` en `App.jsx`: aplicar un pequeño desplazamiento
      (ej. +0.2 en x/z) al clon para que se note al instante, sin que quede
      exactamente superpuesto al original. (Ya estaba implementado: +0.3 en
      x/z.)

### 7. Renombrar objetos desde el panel "Seleccionado"
- [x] Input editable (`RenameField`) para `selected.name` en
      `AltarMenu.jsx`, reflejado en la lista "Objetos en escena" (mismo
      estado `objects`). Se confirma con Enter/blur, Esc cancela.

### 8. Persistir estado del reproductor de música
- [x] Guardar volumen y última pista en `localStorage` desde
      `MusicPlayer.jsx` (`altar-music-volume-v1` / `altar-music-track-v1`).
      No se persiste "sonando": los navegadores bloquean el autoplay sin
      gesto del usuario, así que igual hay que tocar play de nuevo.

## Prioridad baja / nice-to-have

### 9. Preview antes de compartir
- [x] Reusar la captura de canvas (helper `withCleanCanvas`, compartido con
      `captureScreenshot`) para mostrar la imagen en un modal de
      confirmación (`SharePreviewModal.jsx`: "¿Así se ve tu altar?
      Compartir / Cancelar") antes de llamar a `shareAltar`.

### 10. Centrar cámara en el objeto seleccionado ("foco")
- [x] Atajo F que reutiliza `focusRef` (el mismo mecanismo que ya usaba
      `selectFromList`) para apuntar la cámara al objeto seleccionado —
      funciona sin importar cómo se seleccionó (lista o click en la
      escena). No es una animación de dolly, solo re-apunta el pivot de
      OrbitControls; si hace falta acercar también, es un paso aparte.

### 11. Indicador continuo de cupo de objetos
- [x] Barra de progreso sutil y persistente (`.quota-bar` en
      `AltarMenu.jsx`) bajo "Objetos en escena (n/max)"; cambia a ámbar al
      pasar `objectsWarningAt` y a rojo al llegar al máximo. Las notas de
      texto de advertencia se mantienen.

### 12. Modal de compartir con redes sociales
- [x] `ShareModal.jsx`: reemplaza el toast de "enlace copiado" por un modal
      con el link, botón "Copiar" y accesos a WhatsApp/Facebook/X/Email
      (web intents, funcionan en desktop y mobile).
- [x] Botón "Compartir…" con `navigator.share` (share sheet nativo) cuando
      el navegador lo soporta — es lo que lo hace realmente funcional en
      teléfono (incluye apps instaladas, no solo las 4 fijas).
- [x] El link se sigue copiando al portapapeles en segundo plano al abrir
      el modal (best-effort, no bloquea si el navegador lo rechaza).

### 13. Catálogo de decoración visible (descubribilidad)
Problema: la decoración (30 objetos, lo más rico del catálogo) vivía en
acordeones colapsados y debajo de "Forma básica", así que las miniaturas
nunca se veían sin hacer clic.
- [x] Sección propia "Decoración (n)" arriba, con hint "Toca una miniatura
      para sumarla al altar"; "Forma básica" demovida al final.
- [x] Chips de categoría (Todo / Papel picado / Comida / Decoración /
      Velas, con contadores) en vez de acordeones `<details>`.
- [x] Cuadrícula de miniaturas siempre visible (`.decor-groups`,
      scrollable); con "Todo" o buscando, los grupos se separan con
      etiquetas. El buscador ignora el chip activo para no esconder
      resultados (los chips se deshabilitan mientras se escribe).
