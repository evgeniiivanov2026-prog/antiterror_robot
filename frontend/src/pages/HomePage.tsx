import { Link } from "react-router-dom";
import { DISCLAIMER, SLOGAN } from "../content/ru";
import { Logo } from "../components/Logo";
import { Reminder } from "../components/Reminder";

export function HomePage() {
  return (
    <main className="screen" id="content">
      <header className="hero">
        <Logo />
        <p className="eyebrow">Фиксация сообщений</p>
        <h1 className="title">AntiTerror Robot</h1>
        <p className="slogan">{SLOGAN}</p>
      </header>
      <p className="disclaimer">{DISCLAIMER}</p>
      <div className="stack">
        <Link className="button primary" to="/category">
          Сообщить о происшествии
        </Link>
        <Link className="button danger" to="/emergency">
          Срочная помощь
        </Link>
        <Link className="button ghost" to="/evidence-guide">
          Как сохранить доказательства
        </Link>
        <Link className="button ghost" to="/contacts">
          Полезные контакты
        </Link>
      </div>
      <Reminder />
      <Link className="text-link" to="/privacy">
        Конфиденциальность
      </Link>
    </main>
  );
}
