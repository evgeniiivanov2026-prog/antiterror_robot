import { CATEGORY_LABELS, STATUS_LABELS, THREAT_LABELS, type CategoryId } from "../domain/categories";
import type { Report } from "../types/report";

const SUSPECT_LABELS: Record<string, string> = {
  display_name: "Имя",
  username: "Имя пользователя",
  platform_id: "Идентификатор",
  channel: "Канал",
  phone: "Телефон",
  note: "Заметка",
};

export function IncidentCard({ report }: { report: Report }) {
  return (
    <article className="card" aria-labelledby="card-title">
      <p className="eyebrow">Карточка инцидента</p>
      <h2 id="card-title" className="public-id">
        {report.public_id}
      </h2>
      <dl>
        <div>
          <dt>Категория</dt>
          <dd>{CATEGORY_LABELS[report.category as CategoryId] ?? report.category}</dd>
        </div>
        <div>
          <dt>Срочность</dt>
          <dd>{THREAT_LABELS[report.threat_level] ?? report.threat_level}</dd>
        </div>
        <div>
          <dt>Статус</dt>
          <dd>{STATUS_LABELS[report.status] ?? report.status}</dd>
        </div>
        <div>
          <dt>Платформа</dt>
          <dd>{report.platform}</dd>
        </div>
        {report.occurred_at ? (
          <div>
            <dt>Когда</dt>
            <dd>{new Date(report.occurred_at).toLocaleString("ru")}</dd>
          </div>
        ) : null}
        {report.source_url ? (
          <div>
            <dt>Ссылка</dt>
            <dd>{report.source_url}</dd>
          </div>
        ) : null}
        <div>
          <dt>Описание</dt>
          <dd>{report.description}</dd>
        </div>
        <div>
          <dt>Требования</dt>
          <dd>{report.demands.summary || "Не описаны"}</dd>
        </div>
        {report.suspect
          ? Object.entries(report.suspect).map(([key, value]) => (
              <div key={key}>
                <dt>{SUSPECT_LABELS[key] ?? key}</dt>
                <dd>{value}</dd>
              </div>
            ))
          : null}
        <div>
          <dt>Контакт для связи</dt>
          <dd>{report.contact_masked || "Не оставлен"}</dd>
        </div>
        <div>
          <dt>Файлы</dt>
          <dd>{report.evidence.length ? `${report.evidence.length} шт.` : "Не приложены"}</dd>
        </div>
      </dl>
      <p className="disclaimer">{report.disclaimer}</p>
      <p className="disclaimer">{report.safety_notice}</p>
    </article>
  );
}
