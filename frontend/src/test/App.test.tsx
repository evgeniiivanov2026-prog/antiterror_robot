import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "../App"

beforeEach(() => {
  localStorage.clear()
})

describe("mini app", () => {
  it("shows the home actions and the disclaimer", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "AntiTerror Robot" })).toBeInTheDocument()
    expect(screen.getByText("Сообщай. Фиксируй. Защищай.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Сообщить о происшествии" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Срочная помощь" })).toBeEnabled()
    expect(screen.getByText(/не является правоохранительным органом/i)).toBeInTheDocument()
    expect(document.querySelector("input[type='password']")).toBeNull()
  })

  it("opens emergency numbers 112 and 102", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Срочная помощь" }))
    expect(screen.getByRole("heading", { name: "Срочная опасность" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /112/ })).toHaveAttribute("href", "tel:112")
    expect(screen.getByRole("link", { name: /102/ })).toHaveAttribute("href", "tel:102")
    expect(screen.getByRole("heading", { name: "Если вам меньше 18 лет" })).toBeInTheDocument()
  })

  it("walks from a category into the stepped form", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Сообщить о происшествии" }))
    expect(screen.getByRole("heading", { name: "Что произошло" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }))
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
    expect(screen.getByRole("textbox", { name: "Описание" })).toBeRequired()
    expect(screen.queryByLabelText(/cvv/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/пароль/i)).not.toBeInTheDocument()
  })

  it("interrupts the form when the description signals danger", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Сообщить о происшествии" }))
    await user.click(screen.getByRole("button", { name: /Шантаж/ }))
    await user.type(screen.getByRole("textbox", { name: "Описание" }), "Ситуация: шантаж")
    expect(await screen.findByRole("heading", { name: "Срочная опасность" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Я в безопасности, продолжить фиксацию" }))
    expect(screen.getByRole("textbox", { name: "Описание" })).toHaveValue("Ситуация: шантаж")
  })

  it("lists the youth hotline and the FSB trust line", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Полезные контакты" }))
    expect(screen.getByRole("link", { name: /8-800-2000-122/ })).toHaveAttribute("href", "tel:88002000122")
    expect(screen.getByRole("link", { name: /8-800-224-22-22/ })).toHaveAttribute("href", "tel:88002242222")
    expect(screen.getByRole("link", { name: /Электронная приемная/ })).toHaveAttribute(
      "href",
      "https://www.fsb.ru/fsb/webreception.htm",
    )
    expect(screen.getByText(/отдельной линии только для подростков/i)).toBeInTheDocument()
  })

  it("hides the admin panel until the session role is admin", async () => {
    render(<App />)
    expect(await screen.findByRole("heading", { name: "AntiTerror Robot" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Панель администратора" })).not.toBeInTheDocument()
  })

  it("opens the admin queue and hides the suspect phone", async () => {
    const user = userEvent.setup()
    const reportId = "11111111-1111-1111-1111-111111111111"
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/api/v1/me")) {
          return Response.json({ role: "admin", telegram_id: 42 })
        }
        if (url.endsWith("/api/v1/moderation/reports")) {
          return Response.json([
            {
              id: reportId,
              public_id: "ATR-ABC234",
              category: "fraud",
              threat_level: "low",
              status: "new",
              created_at: "2026-11-01T10:00:00Z",
            },
          ])
        }
        if (url.endsWith(`/api/v1/moderation/reports/${reportId}`)) {
          return Response.json({
            id: reportId,
            public_id: "ATR-ABC234",
            category: "fraud",
            description: "Просили перевод за несуществующий заказ.",
            occurred_at: null,
            platform: "Telegram",
            source_url: null,
            suspect_identifiers: { username: "example_user", phone: "+79990001122" },
            demands: null,
            threat_level: "low",
            contact_consent: true,
            contact_channel: "email",
            contact_hint: "p***@example.com",
            status: "new",
            created_at: "2026-11-01T10:00:00Z",
            updated_at: "2026-11-01T10:00:00Z",
            evidence: [],
            disclaimer: "Не является правоохранительным органом.",
            mvd_recommendation: "",
            urgency_note: "",
          })
        }
        throw new Error("offline")
      }),
    )
    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Панель администратора" }))
    expect(screen.getByRole("heading", { name: "Панель администратора" })).toBeInTheDocument()
    await user.click(await screen.findByRole("button", { name: /ATR-ABC234/ }))
    expect(screen.getByText("example_user")).toBeInTheDocument()
    expect(screen.queryByText("+79990001122")).not.toBeInTheDocument()
    expect(screen.queryByText("p***@example.com")).not.toBeInTheDocument()
    expect(screen.getByText(/Контакт автора не показывается/)).toBeInTheDocument()
  })
})
