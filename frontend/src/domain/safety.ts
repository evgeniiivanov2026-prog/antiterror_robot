const SECRET_MESSAGE =
  "Не отправляйте пароли, коды из СМС, CVV и данные банковских карт. Удалите их из текста — для фиксации они не нужны.";

const STEMS = [
  "угроз",
  "насили",
  "срочно",
  "убий",
  "изнасил",
  "суицид",
  "взорв",
  "теракт",
  "заложник",
  "ребен",
  "ребён",
  "дети",
  "детск",
  "несовершеннолет",
  "шантаж",
];

export function hasDangerSignal(text: string): boolean {
  const lower = text.toLocaleLowerCase("ru");
  return STEMS.some((stem) => hasStem(lower, stem));
}

export function findSecret(text: string): string | null {
  if (/(?:парол[ья]|password|pwd)\s*[:=]\s*\S{4,}/i.test(text)) return SECRET_MESSAGE;
  if (/\b(?:cvv|cvc)\s*[:=]?\s*\d{3,4}\b/i.test(text)) return SECRET_MESSAGE;
  if (/(?:код(?:\s+из)?\s+смс|смс-код|sms(?:\s*code)?)\s*[:=]?\s*\d{4,8}/i.test(text)) return SECRET_MESSAGE;
  const match = text.match(/\d(?:[ \d-]*\d){12,}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  if (digits.length === 20) return "Не указывайте номер банковского счёта. Для фиксации это не нужно.";
  if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return SECRET_MESSAGE;
  return null;
}

export function luhn(number: string): boolean {
  let total = 0;
  const reversed = number.split("").reverse();
  reversed.forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
  });
  return total > 0 && total % 10 === 0;
}

function hasStem(text: string, stem: string): boolean {
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(stem, from);
    if (index < 0) return false;
    const before = index === 0 ? "" : text[index - 1];
    if (!isLetter(before)) return true;
    from = index + stem.length;
  }
  return false;
}

function isLetter(char: string): boolean {
  return char !== "" && /[0-9a-zа-яё]/i.test(char);
}
