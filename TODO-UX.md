# TODO — UI/UX para quien arma su altar

Contexto: mejoras de experiencia para el flujo de armado del altar (menú,
viewport 3D, edición de objetos), separadas del TODO de moderación de
contenido (`TODO.md`). Vamos paso a paso, sin orden fijo salvo lo marcado
como prioridad.

## Prioridad alta (mayor impacto, menor esfuerzo)

### 1. Buscador en "Decoración"
- [x] Input de texto arriba de `.category-list` en `AltarMenu.jsx` que
      filtre modelos y papel picado por nombre.
- [x] Auto-expandir (`open`) las categorías que tengan al menos un match
      mientras se escribe; colapsar el resto.
- [x] Estado vacío ("Sin resultados para «...»") si ningún modelo matchea.

### 2. Undo (Ctrl+Z) para mover/borrar/agregar
- [x] Historial simple de snapshots de `objects` (pila acotada, ej. 20
      pasos) en `App.jsx`.
- [x] Atajo Ctrl+Z (y Ctrl+Shift+Z o Ctrl+Y para redo) además de los que ya
      existen (G/R/S/Esc).
- [x] Botones ↶/↷ en la toolbar flotante (`TransformToolbar.jsx`) para
      quien no tiene teclado (mobile) o no conoce el atajo.
- [ ] Una vez que exista undo, reevaluar si "Eliminar" un objeto individual
      necesita seguir sin confirmación, o si "Limpiar altar" puede perder su
      `window.confirm` (ver punto 5).

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
- [ ] Decidir una sola política para "Eliminar objeto" vs "Limpiar altar"
      (hoy solo "Limpiar altar" tiene `window.confirm`).
- [ ] Si hay undo (punto 2), evaluar sacar el `confirm()` de "Limpiar
      altar" también, o reemplazarlo por un toast con "Deshacer".

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
- [ ] Guardar volumen (y opcionalmente última pista) en `localStorage`
      desde `MusicPlayer.jsx`, mismo patrón que el resto de la app.

## Prioridad baja / nice-to-have

### 9. Preview antes de compartir
- [ ] Reusar `captureScreenshot` para mostrar la imagen capturada en un
      modal de confirmación ("¿Así se ve? Compartir / Cancelar") antes de
      llamar a `shareAltar`, ya que ambos botones están uno al lado del
      otro en el viewport.

### 10. Centrar cámara en el objeto seleccionado ("foco")
- [x] Atajo F que reutiliza `focusRef` (el mismo mecanismo que ya usaba
      `selectFromList`) para apuntar la cámara al objeto seleccionado —
      funciona sin importar cómo se seleccionó (lista o click en la
      escena). No es una animación de dolly, solo re-apunta el pivot de
      OrbitControls; si hace falta acercar también, es un paso aparte.

### 11. Indicador continuo de cupo de objetos
- [ ] Barra de progreso sutil y persistente junto a "Objetos en escena
      (n/max)" en vez de esperar al umbral `objectsWarningAt` para avisar.
