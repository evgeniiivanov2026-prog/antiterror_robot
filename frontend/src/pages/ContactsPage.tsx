import { Screen } from "../components/Screen"
import { DISCLAIMER } from "../content/copy"

const CONTACTS = [
  { href: "tel:112", title: "112", text: "Единый номер экстренных служб. Звоните, если опасность рядом." },
  { href: "tel:102", title: "102", text: "Полиция. Сюда же можно сообщить о мошенничестве и угрозах." },
  {
    href: "tel:88002000122",
    title: "8-800-2000-122",
    text: "Горячая линия для подростков. Детский телефон доверия, бесплатно и анонимно. Это поддержка, а не сообщение в ФСБ.",
  },
  {
    href: "tel:88002242222",
    title: "8-800-224-22-22",
    text: "Телефон доверия ФСБ России с сайта fsb.ru. Также 8 (495) 224-22-22, круглосуточно. SMS: 8-916-240-24-84. С этих номеров сотрудники сами не звонят и не пишут в мессенджерах.",
  },
  {
    href: "https://www.fsb.ru/fsb/webreception.htm",
    title: "Электронная приемная",
    text: "Официальная форма на fsb.ru, если телефон занят. Сообщение отправляете вы сами, не этот сервис.",
  },
]

export function ContactsPage() {
  return (
    <Screen
      title="Полезные контакты"
      lede="Сервис не соединяет со службами автоматически. На fsb.ru нет отдельной линии только для подростков: 25 марта 2026 года там советуют прекратить переписку, сказать взрослому и позвонить 112 или 102."
    >
      <div className="choice-list">
        {CONTACTS.map((contact) => (
          <a
            key={contact.href}
            className="choice"
            href={contact.href}
            {...(contact.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <strong>{contact.title}</strong>
            <span>{contact.text}</span>
          </a>
        ))}
      </div>
      <p className="footer-note">{DISCLAIMER}</p>
    </Screen>
  )
}
