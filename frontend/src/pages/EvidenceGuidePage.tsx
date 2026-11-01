import { Link, useNavigate } from "react-router-dom";
import { Screen } from "../components/Screen";
import { useRegisterBack } from "../components/Shell";

const STEPS = [
  "Не удаляйте чат и не редактируйте сообщения.",
  "Сделайте скриншоты, где видны имя, ссылка, дата и текст.",
  "Сохраните ссылку на аккаунт, канал или чат.",
  "Не вступайте в спор и не выполняйте требования.",
  "Не загружайте интимные материалы. Если давление связано с такими файлами, отнесите устройство в полицию.",
  "Не записывайте пароли, коды из SMS, CVV и полные номера карт.",
];

export function EvidenceGuidePage() {
  const navigate = useNavigate();
  useRegisterBack(() => navigate("/"));
  return (
    <Screen title="Как сохранить доказательства" lede="Копия на вашем устройстве важна. Сервис хранит файлы ограниченное время.">
      <ol className="guide">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Link className="button primary" to="/category">
        Перейти к сообщению
      </Link>
    </Screen>
  );
}
