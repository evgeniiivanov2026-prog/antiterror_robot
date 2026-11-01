import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { SafetyFooter } from "../components/SafetyFooter";
import { CATEGORIES, type CategoryId } from "../domain/categories";
import { useBackButton } from "../hooks/useTelegram";
import { useDraft } from "../hooks/useDraft";

export function CategoryPage() {
  const navigate = useNavigate();
  const { update } = useDraft();
  useBackButton(() => navigate("/"));

  useEffect(() => {
    document.title = "Категория — AntiTerror Robot";
  }, []);

  function choose(id: CategoryId) {
    update({ category: id });
    if (id === "emergency") {
      navigate("/emergency?returnTo=/report");
      return;
    }
    navigate("/report");
  }

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Шаг выбора</p>
        <h1>Что произошло?</h1>
        <p className="lede">Выберите ближайшую категорию. Если сомневаетесь, отметьте «Я свидетель».</p>
      </div>
      <div className="choice-list" role="list">
        {CATEGORIES.map((category) => (
          <button key={category.id} type="button" className="choice" onClick={() => choose(category.id)}>
            <span>{category.title}</span>
            <small>{category.description}</small>
            {category.suggestsEmergency && category.id !== "emergency" ? (
              <small>Если страшно прямо сейчас, сначала откройте срочную помощь.</small>
            ) : null}
          </button>
        ))}
      </div>
      <SafetyFooter />
    </section>
  );
}
