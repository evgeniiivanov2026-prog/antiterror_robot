const STEMS = [
  "угроз",
  "насили",
  "шантаж",
  "ребен",
  "срочн",
  "убий",
  "убить",
  "убь",
  "изнасил",
  "суицид",
  "самоубий",
  "похищ",
  "теракт",
  "взорв",
  "избей",
  "залож",
  "оруж",
]

export function hasEmergencySignal(text: string): boolean {
  const value = text.toLowerCase().replaceAll("ё", "е")
  return STEMS.some((stem) => value.includes(stem))
}
