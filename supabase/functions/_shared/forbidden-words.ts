// Lista básica de términos prohibidos, compartida por todas las Edge
// Functions que validan texto libre (nombre de altar, mensajes). Solo cubre
// insultos/vulgaridades comunes en español; no pretende ser exhaustiva.
// Fácil de editar: un término por línea, en minúsculas y sin tildes (la
// comparación normaliza el texto de entrada antes de chequear).
export const FORBIDDEN_WORDS: string[] = [
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

// Normaliza: minúsculas, sin tildes/diacríticos, espacios colapsados.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsForbiddenWord(text: string): boolean {
  const normalized = normalize(text);
  return FORBIDDEN_WORDS.some((word) => normalized.includes(normalize(word)));
}
