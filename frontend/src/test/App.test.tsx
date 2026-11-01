import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
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
})
