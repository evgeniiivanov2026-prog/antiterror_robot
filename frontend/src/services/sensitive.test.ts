import { describe, expect, it } from "vitest";
import { findSensitive, luhnOk } from "./sensitive";
import { hasDangerSignal } from "./threats";

describe("sensitive text", () => {
  it("detects a card number and ignores a narrative", () => {
    expect(luhnOk("4111111111111111")).toBe(true);
    expect(findSensitive("Вот номер 4111111111111111")).toContain("card_number");
    expect(findSensitive("Он попросил код из смс, но я ничего не отправил.")).toEqual([]);
  });

  it("notices danger words", () => {
    expect(hasDangerSignal("Мне срочно угрожают")).toBe(true);
    expect(hasDangerSignal("Обычный рассказ о переписке")).toBe(false);
  });
});
