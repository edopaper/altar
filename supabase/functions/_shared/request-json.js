// Limita el cuerpo real, incluso cuando Content-Length falta o es incorrecto.
export async function readJsonBody(request, maxBytes = 8 * 1024 * 1024) {
  const tooLarge = () => Object.assign(new Error('El contenido supera el tamaño permitido.'), { status: 413 })
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge()
  if (!request.body) throw new Error('JSON inválido')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw tooLarge() }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally { reader.releaseLock() }
}
