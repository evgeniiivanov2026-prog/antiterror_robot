import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { SafetyFooter } from "../components/SafetyFooter";
import { useBackButton } from "../hooks/useTelegram";

const STEPS = [
  "Не удаляйте переписку и не очищайте чат.",
  "Сделайте скриншоты, где видны имя, дата и текст. Не обрезайте их.",
  "Сохраните ссылку на аккаунт, канал или сообщение.",
  "Не скачивайте файлы, которые просят открыть «для проверки».",
  "Не отправляйте пароли, коды, данные карт и интимные фото. Напишите только, что такие требования были.",
];

export function EvidenceGuidePage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/"));
  useEffect(() => {
    document.title = "Доказательства — AntiTerror Robot";
  }, []);

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Памятка</p>
        <h1>Как сохранить доказательства</h1>
        <p className="lede">Спокойно сохраните то, что уже есть. Не вступайте в новый разговор, чтобы «добыть больше».</p>
      </div>
      <ol className="guide">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="disclaimer">
        Карточка в сервисе — ваша личная фиксация. Для заявления её нужно отнести в полицию самостоятельно.
      </p>
      <Button to="/category">Перейти к сообщению</Button>
      <SafetyFooter />
    </section>
  );
}
