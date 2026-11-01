import { describe, expect, it } from "vitest"
import { hasEmergencySignal } from "../services/safety"

describe("emergency signals", () => {
  it("recognizes urgent language including yo", () => {
    expect(hasEmergencySignal("Мне срочно угрожают")).toBe(true)
    expect(hasEmergencySignal("Ребёнку написали и требуют встречу")).toBe(true)
    expect(hasEmergencySignal("Это шантаж")).toBe(true)
  })

  it("does not flag an ordinary description", () => {
    expect(hasEmergencySignal("Просили оплатить несуществующий заказ вчера днём")).toBe(false)
  })
})
