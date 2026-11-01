import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Screen } from "../components/Screen";
import { useRegisterBack } from "../components/Shell";
import { api } from "../services/api";
import { safeInternalPath } from "../services/threats";
import { haptic } from "../hooks/useTelegram";

export function EmergencyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeInternalPath(params.get("returnTo"));
  useRegisterBack(() => navigate(returnTo ?? "/"));

  const trigger = params.get("trigger");
  useEffect(() => {
    haptic("warning");
    const kind = trigger === "keyword" || trigger === "category" ? trigger : "manual";
    void api.emergency(kind).catch(() => undefined);
  }, [trigger]);

  function continueSafely() {
    sessionStorage.setItem("atr-danger-ack", "1");
    navigate(returnTo ?? "/");
  }

  return (
    <Screen
      title="Срочная помощь"
      lede="Если опасность происходит сейчас, сначала позвоните. Не ждите ответа в приложении."
    >
      <div className="stack">
        <a className="button call" href="tel:112">
          Позвонить 112
        </a>
        <a className="button call secondary-call" href="tel:102">
          Позвонить 102
        </a>
      </div>
      <p className="hint">112 — единый номер экстренных служб. 102 — полиция. Если кнопка не сработала, наберите номер вручную.</p>
      <section className="note">
        <h2>Если вы несовершеннолетний</h2>
        <p>Можно позвонить самому и сказать взрослому рядом. Не езжайте на встречу и не оставайтесь наедине с тем, кто давит.</p>
        <p>Не выполняйте требования. Не отправляйте коды, пароли и деньги.</p>
      </section>
      {returnTo ? (
        <button type="button" className="button ghost" onClick={continueSafely}>
          Я в безопасности, продолжить
        </button>
      ) : (
        <Link className="button ghost" to="/">
          На главную
        </Link>
      )}
    </Screen>
  );
}
