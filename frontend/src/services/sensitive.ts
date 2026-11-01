const PASSWORD = /\b(пароль|password|passphrase)\b\s*[:=]\s*\S+/i;
const CVV = /\b(cvv|cvc|cid)\b\s*[:=]?\s*\d{3,4}\b/i;
const OTP =
  /(код\s*(из\s*)?(смс|sms)|смс-код|sms-код|одноразовый\s*код|one[- ]time\s*code|\botp\b)\s*[:=]?\s*\d{4,8}\b/i;
const CARD = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;

export const SECRET_HINT =
  "Уберите пароли, коды из SMS, CVV и полные номера карт. Опишите ситуацию своими словами.";

export function luhnOk(number: string): boolean {
  if (!/^\d{13,19}$/.test(number)) return false;
  const digits = [...number].map(Number);
  const parity = digits.length % 2;
  let total = 0;
  digits.forEach((digit, index) => {
    let value = digit;
    if (index % 2 === parity) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    total += value;
  });
  return total % 10 === 0;
}

export function findSensitive(text: string): string[] {
  const found: string[] = [];
  if (PASSWORD.test(text)) found.push("password");
  if (CVV.test(text)) found.push("cvv");
  if (OTP.test(text)) found.push("otp");
  for (const match of text.matchAll(CARD)) {
    const digits = match[0].replace(/\D/g, "");
    if (luhnOk(digits)) {
      found.push("card_number");
      break;
    }
  }
  return found;
}

export function hasSecret(text: string): boolean {
  return findSensitive(text).length > 0;
}
