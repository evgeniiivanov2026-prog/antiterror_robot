import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "./AppRoutes";
import { Shell } from "./components/Shell";
import { DraftProvider } from "./hooks/useDraft";

function renderApp(path = "/") {
  return render(
    <DraftProvider>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Shell>
          <AppRoutes />
        </Shell>
      </MemoryRouter>
    </DraftProvider>,
  );
}

describe("mini app", () => {
  it("shows the home actions and the limit of the service", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "AntiTerror Robot" })).toBeInTheDocument();
    expect(screen.getByText("Сообщай. Фиксируй. Защищай.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Сообщить о происшествии" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Срочная помощь" })).toBeInTheDocument();
    expect(screen.getByText(/не является правоохранительным органом/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("opens emergency numbers", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Срочная помощь" }));
    expect(screen.getByRole("link", { name: "Позвонить 112" })).toHaveAttribute("href", "tel:112");
    expect(screen.getByRole("link", { name: "Позвонить 102" })).toHaveAttribute("href", "tel:102");
    expect(screen.getByRole("heading", { name: "Если вы несовершеннолетний" })).toBeInTheDocument();
  });

  it("walks from a category into the form", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Сообщить о происшествии" }));
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }));
    expect(screen.getByRole("progressbar", { name: "Шаг формы" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByLabelText("Опишите, что произошло")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Дальше" })).toBeDisabled();
  });

  it("blocks a card number", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Сообщить о происшествии" }));
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }));
    await user.type(
      screen.getByLabelText("Опишите, что произошло"),
      "Он прислал номер 4111111111111111 и просил перевод сегодня.",
    );
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/номера карт/i);
  });

  it("shows emergency help when the description sounds urgent", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Сообщить о происшествии" }));
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }));
    await user.type(
      screen.getByLabelText("Опишите, что произошло"),
      "Мне срочно пишут и требуют встретиться сегодня вечером.",
    );
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    expect(await screen.findByRole("link", { name: "Позвонить 112" })).toBeInTheDocument();
  });

  it("keeps a draft after the screen is opened again", async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole("link", { name: "Сообщить о происшествии" }));
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }));
    const text = "Человек предлагал лёгкий заработок и просил перейти в другой чат.";
    await user.type(screen.getByLabelText("Опишите, что произошло"), text);
    first.unmount();
    renderApp("/report");
    expect(screen.getByLabelText("Опишите, что произошло")).toHaveValue(text);
  });
});
