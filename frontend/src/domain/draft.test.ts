import { emptyDraft, loadStoredDraft, saveStoredDraft, toReportPayload, validateDescription } from "./draft";

describe("draft", () => {
  it("does not keep the callback contact in local storage", () => {
    const draft = emptyDraft();
    draft.category = "fraud";
    draft.description = "Текст достаточной длины для черновика сообщения.";
    draft.contactConsent = true;
    draft.contactValue = "+79990000000";
    saveStoredDraft(draft);
    const loaded = loadStoredDraft();
    expect(loaded.contactValue).toBe("");
    expect(loaded.description).toContain("черновика");
    expect(localStorage.getItem("atr-draft-v1")).not.toContain("+79990000000");
  });

  it("omits the contact when consent is off", () => {
    const draft = emptyDraft();
    draft.category = "witness";
    draft.description = "Я видел переписку и хочу спокойно её зафиксировать.";
    draft.platformChoice = "Telegram";
    draft.contactConsent = false;
    draft.contactValue = "secret@example.com";
    const payload = toReportPayload(draft);
    expect(payload.contact_consent).toBe(false);
    expect(payload.contact_value).toBeNull();
    expect(payload.platform).toBe("Telegram");
  });

  it("asks for a longer description", () => {
    expect(validateDescription("мало текста")).toMatch(/подробнее/);
  });
});
