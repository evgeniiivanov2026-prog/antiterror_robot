const SIGNALS = [
  "угроз",
  "насили",
  "шантаж",
  "ребенок",
  "ребенк",
  "несовершеннолет",
  "срочно",
  "убить",
  "убьют",
  "убий",
  "изнасил",
  "суицид",
  "самоубий",
  "теракт",
  "взрыв",
  "оружи",
];

export function hasDangerSignal(text: string): boolean {
  const folded = text.toLowerCase().replaceAll("ё", "е");
  return SIGNALS.some((signal) => folded.includes(signal));
}

export function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
