import { findSecret, hasDangerSignal, luhn } from "./safety";

describe("safety signals", () => {
  it("recognizes urgent words and ignores a negated stem inside another word", () => {
    expect(hasDangerSignal("Мне срочно угрожают")).toBe(true);
    expect(hasDangerSignal("Пишет ребёнок и просит о помощи")).toBe(true);
    expect(hasDangerSignal("Несрочно всё спокойно, давления нет")).toBe(false);
  });

  it("blocks card numbers but not a mention of a password", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(findSecret("Номер 4111 1111 1111 1111")).toMatch(/карт/);
    expect(findSecret("Он просил пароль, но я его не записывал.")).toBeNull();
  });
});
