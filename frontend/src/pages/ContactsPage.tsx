import { Screen } from "../components/Screen"
import { DISCLAIMER } from "../content/copy"

const CONTACTS = [
  { href: "tel:112", title: "112", text: "Единый номер экстренных служб. Звоните, если опасность рядом." },
  { href: "tel:102", title: "102", text: "Полиция. Сюда же можно сообщить о мошенничестве и угрозах." },
  {
    href: "tel:88002000122",
    title: "8-800-2000-122",
    text: "Детский телефон доверия. Бесплатно и анонимно. Это поддержка, а не заявление.",
  },
]

export function ContactsPage() {
  return (
    <Screen title="Полезные контакты" lede="Сервис не соединяет со службами автоматически.">
      <div className="choice-list">
        {CONTACTS.map((contact) => (
          <a key={contact.href} className="choice" href={contact.href}>
            <strong>{contact.title}</strong>
            <span>{contact.text}</span>
          </a>
        ))}
      </div>
      <p className="footer-note">{DISCLAIMER}</p>
    </Screen>
  )
}
