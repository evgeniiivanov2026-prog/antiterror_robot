import { beforeEach, describe, expect, it } from "vitest"
import { loadDraft, saveDraft } from "../services/draft"
import { emptyDraft } from "../types/incident"

beforeEach(() => localStorage.clear())

describe("draft storage", () => {
  it("saves the form and restores it without a contact value", () => {
    const draft = emptyDraft()
    draft.category = "fraud"
    draft.description = "Короткое описание ситуации для черновика."
    draft.step = 2
    saveDraft(draft)
    const raw = localStorage.getItem("atr-draft-v1") ?? ""
    expect(raw).not.toContain("contactValue")
    expect(raw).not.toContain("password")
    expect(loadDraft()).toMatchObject({
      category: "fraud",
      description: draft.description,
      step: 2,
    })
  })

  it("ignores a broken draft", () => {
    localStorage.setItem("atr-draft-v1", "{")
    expect(loadDraft()).toBeNull()
  })
})
