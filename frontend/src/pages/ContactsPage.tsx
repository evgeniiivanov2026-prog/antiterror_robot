import { useNavigate } from "react-router-dom";
import { Screen } from "../components/Screen";
import { useRegisterBack } from "../components/Shell";

export function ContactsPage() {
  const navigate = useNavigate();
  useRegisterBack(() => navigate("/"));
  return (
    <Screen title="Полезные контакты" lede="Эти номера принадлежат государственным службам, не боту.">
      <ul className="contacts">
        <li>
          <a href="tel:112">112</a>
          <span>Единый номер экстренных служб</span>
        </li>
        <li>
          <a href="tel:102">102</a>
          <span>Полиция</span>
        </li>
        <li>
          <a href="tel:88002000122">8 800 2000 122</a>
          <span>Детский телефон доверия</span>
        </li>
        <li>
          <a href="https://мвд.рф" rel="noreferrer">
            мвд.рф
          </a>
          <span>Официальный сайт МВД России. Карточку можно показать при личном обращении.</span>
        </li>
      </ul>
      <p className="hint">AntiTerror Robot не передаёт карточку в МВД и не гарантирует проверку.</p>
    </Screen>
  );
}
