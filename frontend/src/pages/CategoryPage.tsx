import type { CategoryInfo } from "../types/incident"
import { Screen } from "../components/Screen"
import { DISCLAIMER } from "../content/copy"

export function CategoryPage({
  categories,
  disclaimer,
  offline,
  onSelect,
}: {
  categories: CategoryInfo[]
  disclaimer: string
  offline: boolean
  onSelect: (category: CategoryInfo) => void
}) {
  return (
    <Screen title="Что произошло" lede="Выберите ближайшую тему. Точная юридическая оценка здесь не нужна.">
      {offline ? <p className="note">Список открыт без сети. Чтобы отправить карточку, нужно подключение.</p> : null}
      <div className="choice-list">
        {categories.map((category) => (
          <button key={category.id} className="choice" type="button" onClick={() => onSelect(category)}>
            <strong>{category.title}</strong>
            <span>{category.description}</span>
          </button>
        ))}
      </div>
      <p className="footer-note">{disclaimer || DISCLAIMER}</p>
    </Screen>
  )
}
