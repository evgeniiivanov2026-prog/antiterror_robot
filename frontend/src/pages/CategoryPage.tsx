import { useNavigate } from "react-router-dom";
import { CATEGORIES } from "../content/ru";
import type { CategoryId } from "../types/report";
import { Screen } from "../components/Screen";
import { useDraft } from "../hooks/useDraft";
import { haptic } from "../hooks/useTelegram";
import { useRegisterBack } from "../components/Shell";

export function CategoryPage() {
  const navigate = useNavigate();
  const { update } = useDraft();
  useRegisterBack(() => navigate("/"));

  function choose(id: CategoryId) {
    haptic("light");
    update({ category: id, step: 0 });
    if (id === "emergency") navigate("/emergency?returnTo=/report&trigger=category");
    else navigate("/report");
  }

  return (
    <Screen title="О чём сообщение" lede="Выберите ближайшую категорию. Точность можно уточнить в описании.">
      <div className="stack">
        {CATEGORIES.map((item) => (
          <button key={item.id} type="button" className="choice" onClick={() => choose(item.id)}>
            <span className="choice-title">{item.title}</span>
            <span className="choice-text">{item.text}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
