import { useEffect } from "react";

import { Button } from "../components/Button";
import { SafetyFooter } from "../components/SafetyFooter";

export function HomePage() {
  useEffect(() => {
    document.title = "AntiTerror Robot";
  }, []);

  return (
    <section className="stack">
      <div className="hero">
        <p className="eyebrow">@antiterror_robot</p>
        <h1>AntiTerror Robot</h1>
        <p className="slogan">Сообщай. Фиксируй. Защищай.</p>
      </div>
      <p className="disclaimer">
        Это не полиция. Сервис помогает зафиксировать информацию и подсказывает, как обратиться в МВД. Он не ведёт
        расследование, никого не обвиняет и не обещает, что сообщение проверят.
      </p>
      <div className="stack">
        <Button to="/category">Сообщить о происшествии</Button>
        <Button to="/emergency" variant="danger">
          Срочная помощь
        </Button>
        <Button to="/evidence" variant="ghost">
          Как сохранить доказательства
        </Button>
        <Button to="/contacts" variant="ghost">
          Полезные контакты
        </Button>
      </div>
      <SafetyFooter />
    </section>
  );
}
