import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { recordEmergency } from "../services/api";
import { useBackButton } from "../hooks/useTelegram";
import { useDraft } from "../hooks/useDraft";

export function EmergencyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { acknowledgeDanger } = useDraft();
  const backToReport = new URLSearchParams(location.search).get("returnTo") === "/report";

  function leave() {
    if (backToReport) {
      acknowledgeDanger();
      navigate("/report");
      return;
    }
    navigate("/");
  }

  useBackButton(leave);

  useEffect(() => {
    document.title = "Срочная помощь — AntiTerror Robot";
    if (import.meta.env.MODE === "test") return;
    recordEmergency().catch(() => undefined);
  }, []);

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Срочная помощь</p>
        <h1>Если опасность сейчас — звоните</h1>
        <p className="lede">Не ждите ответа в приложении и не оставайтесь один на один с перепиской.</p>
      </div>
      <div className="stack">
        <Button href="tel:112" variant="call">
          Позвонить 112
        </Button>
        <Button href="tel:102" variant="ghost">
          Позвонить 102
        </Button>
      </div>
      <section className="note" aria-labelledby="minor-help">
        <h2 id="minor-help">Если вам меньше 18 лет</h2>
        <p>
          Можно позвонить вместе с родителем или другим взрослым, которому вы доверяете. Детский телефон доверия
          бесплатный.
        </p>
        <Button href="tel:88002000122" variant="ghost">
          Детский телефон доверия 8 800 2000 122
        </Button>
      </section>
      <p>Не выполняйте требования и не открывайте ссылки из угроз. Карточка в сервисе не заменяет звонок.</p>
      <Button variant={backToReport ? "primary" : "ghost"} onClick={leave}>
        {backToReport ? "Вернуться к фиксации" : "На главную"}
      </Button>
    </section>
  );
}
