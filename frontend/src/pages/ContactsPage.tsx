import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { useBackButton } from "../hooks/useTelegram";

export function ContactsPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/"));
  useEffect(() => {
    document.title = "Контакты — AntiTerror Robot";
  }, []);

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Куда обратиться</p>
        <h1>Полезные контакты</h1>
        <p className="lede">Сервис не передаёт вашу карточку в полицию. Звонок и заявление вы делаете сами.</p>
      </div>
      <div className="stack">
        <Button href="tel:112" variant="call">
          112 — экстренные службы
        </Button>
        <Button href="tel:102" variant="ghost">
          102 — полиция
        </Button>
        <Button href="tel:88002000122" variant="ghost">
          8 800 2000 122 — детский телефон доверия
        </Button>
      </div>
      <p>
        Чтобы подать заявление, обратитесь в ближайшее отделение МВД. Возьмите с собой скриншоты и карточку, если
        успели её сохранить. Не отправляйте деньги и не выполняйте требования злоумышленника.
      </p>
    </section>
  );
}
