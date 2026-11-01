import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { App } from "../App";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("mini app screens", () => {
  it("shows the home actions", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "AntiTerror Robot" })).toBeInTheDocument();
    expect(screen.getByText("Сообщай. Фиксируй. Защищай.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Сообщить о происшествии" })).toHaveAttribute("href", "/category");
    expect(screen.getByRole("link", { name: "Срочная помощь" })).toHaveAttribute("href", "/emergency");
    expect(screen.getByRole("link", { name: "Как сохранить доказательства" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Полезные контакты" })).toBeInTheDocument();
  });

  it("shows emergency numbers", () => {
    renderApp("/emergency");
    expect(screen.getByRole("link", { name: "Позвонить 112" })).toHaveAttribute("href", "tel:112");
    expect(screen.getByRole("link", { name: "Позвонить 102" })).toHaveAttribute("href", "tel:102");
    expect(screen.getByRole("link", { name: /8 800 2000 122/ })).toHaveAttribute("href", "tel:88002000122");
    expect(screen.getByRole("heading", { name: "Если вам меньше 18 лет" })).toBeInTheDocument();
  });

  it("opens the form after a category and blocks a short description", async () => {
    const user = userEvent.setup();
    renderApp("/category");
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }));
    expect(screen.getByRole("textbox", { name: "Что произошло" })).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Что произошло" }), "слишком коротко");
    await user.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/подробнее/);
  });

  it("shows emergency help when the description contains a danger word", async () => {
    const user = userEvent.setup();
    renderApp("/category");
    await user.click(screen.getByRole("button", { name: /Мошенничество/ }));
    await user.type(
      screen.getByRole("textbox", { name: "Что произошло" }),
      "Мне срочно угрожают и требуют встретиться сегодня вечером.",
    );
    await user.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("link", { name: "Позвонить 112" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Вернуться к фиксации" }));
    expect(screen.getByRole("textbox", { name: "Что произошло" })).toHaveValue(
      "Мне срочно угрожают и требуют встретиться сегодня вечером.",
    );
  });
});
