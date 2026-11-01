import { useNavigate } from "react-router-dom";
import { Screen } from "../components/Screen";
import { useRegisterBack } from "../components/Shell";

export function PrivacyPage() {
  const navigate = useNavigate();
  useRegisterBack(() => navigate("/"));
  return (
    <Screen title="Конфиденциальность" lede="Карточка нужна вам, чтобы обратиться в МВД. Мы её не публикуем.">
      <div className="prose">
        <p>Хранятся категория, описание, платформа, указанные вами сведения и файлы. Контакт для связи шифруется.</p>
        <p>Пароли, коды из SMS, CVV, полные номера карт и интимные материалы сохранять нельзя.</p>
        <p>Срок хранения по умолчанию — 90 дней. Удалить карточку можно на экране результата.</p>
        <p>В журнале нет текста сообщения. Сервис не проводит проверку и не является правоохранительным органом.</p>
      </div>
    </Screen>
  );
}
