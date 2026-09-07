// Lista básica de términos prohibidos, compartida por todas las Edge
// Functions que validan texto libre (nombre de altar, mensajes). Solo cubre
// insultos/vulgaridades comunes en español; no pretende ser exhaustiva.
// Fácil de editar: un término por línea, en minúsculas y sin tildes (la
// comparación normaliza el texto de entrada antes de chequear).
export const FORBIDDEN_WORDS = [
  "puta",
  "puto",
  "putos",
  "putas",
  "pendejo",
  "pendeja",
  "pendejos",
  "pendejas",
  "mierda",
  "carajo",
  "gilipollas",
  "cabron",
  "cabrona",
  "verga",
  "coño",
  "pelotudo",
  "pelotuda",
  "boludo",
  "boluda",
  "forro",
  "concha de tu madre",
  "hijo de puta",
  "hija de puta",
  "nazi",
  "hitler",
  "maricon",
  "idiota",
  "estupido",
  "estupida",
  "imbecil",
  "zorra",
  "perra",
  "joder",
];

// Palabras completas; puntuación y diacríticos se normalizan igual en cliente y servidor.
function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}
const normalizedWords = FORBIDDEN_WORDS.map(normalize)
export function containsForbiddenWord(text) {
  const normalized = ` ${normalize(text)} `
  return normalizedWords.some((word) => normalized.includes(` ${word} `))
}
