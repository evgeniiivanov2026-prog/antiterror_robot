import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { DEMANDS, PLATFORMS, SECRET_MESSAGE, STEP_TITLES, categoryTitle } from "../content/ru";
import { Screen } from "../components/Screen";
import { useRegisterBack } from "../components/Shell";
import { useDraft } from "../hooks/useDraft";
import { haptic, useMainButton } from "../hooks/useTelegram";
import { api } from "../services/api";
import { hasSecret } from "../services/sensitive";
import { hasDangerSignal } from "../services/threats";

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
  "text/plain",
]);

export function ReportWizardPage() {
  const navigate = useNavigate();
  const { draft, update, clear } = useDraft();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const step = draft.step;
  const descriptionReady = draft.description.trim().length >= 20;

  useRegisterBack(() => {
    if (step === 0) navigate("/category");
    else update({ step: step - 1 });
  });

  const canContinue = useMemo(() => {
    if (step === 0) return descriptionReady;
    if (step === 4) return draft.evidenceConfirmed;
    if (step === 5) return !busy && (!draft.contactConsent || (draft.contactChannel !== "" && draft.contactValue.trim().length > 3));
    return true;
  }, [busy, descriptionReady, draft.contactChannel, draft.contactConsent, draft.contactValue, draft.evidenceConfirmed, step]);

  function goNext() {
    setError("");
    if (step === 0) {
      if (!descriptionReady) {
        setError("Опишите ситуацию хотя бы в нескольких словах.");
        return;
      }
      if (hasSecret(draft.description)) {
        setError(SECRET_MESSAGE);
        return;
      }
      const danger = draft.immediateDanger || hasDangerSignal(draft.description);
      if (danger && sessionStorage.getItem("atr-danger-ack") !== "1") {
        navigate("/emergency?returnTo=/report&trigger=keyword");
        return;
      }
    }
    if (step === 1 && draft.sourceUrl.trim()) {
      const value = draft.sourceUrl.trim();
      if (!/^https?:\/\//i.test(value) || value.includes("@") || /localhost|127\.|192\.168\.|10\.|169\.254\./i.test(value)) {
        setError("Оставьте только обычную ссылку http или https. Внутренние адреса не сохраняются.");
        return;
      }
    }
    if (step === 3 && hasSecret(draft.demandsSummary)) {
      setError(SECRET_MESSAGE);
      return;
    }
    if (step === 4 && !draft.evidenceConfirmed) {
      setError("Подтвердите, что среди файлов нет запрещённых материалов.");
      return;
    }
    haptic("light");
    update({ step: Math.min(step + 1, 5) });
  }

  async function submit() {
    if (!canContinue || busy) return;
    setBusy(true);
    setError("");
    try {
      const card = await api.createReport(draft);
      let uploadFailed = false;
      for (const file of files) {
        try {
          await api.uploadEvidence(card.id, file);
        } catch {
          uploadFailed = true;
        }
      }
      clear();
      haptic("success");
      navigate(`/result/${card.public_id}`, { state: { uploadFailed } });
    } catch (reason) {
      haptic("warning");
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить карточку.");
      setBusy(false);
    }
  }

  useMainButton(step === 5 ? "Сохранить карточку" : "Дальше", canContinue && !busy, () => {
    if (step === 5) void submit();
    else goNext();
  });

  if (!draft.category) return <Navigate to="/category" replace />;

  function onFiles(list: FileList | null) {
    const next = [...files];
    for (const file of Array.from(list ?? [])) {
      if (!ALLOWED.has(file.type)) {
        setError("Подойдут фото, видео, аудио, PDF или текст.");
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        setError("Файл больше допустимого размера.");
        return;
      }
      if (next.length >= 8) break;
      next.push(file);
    }
    setError("");
    setFiles(next);
  }

  return (
    <Screen title={STEP_TITLES[step]} lede={categoryTitle(draft.category)}>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={6}
        aria-valuenow={step + 1}
        aria-label="Шаг формы"
      >
        <span style={{ width: `${((step + 1) / 6) * 100}%` }} />
      </div>
      <p className="progress-label">
        Шаг {step + 1} из 6
      </p>
      <form
        className="stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (step === 5) void submit();
          else goNext();
        }}
      >
        {step === 0 ? (
          <>
            <label className="field" htmlFor="description">
              Опишите, что произошло
              <textarea
                id="description"
                value={draft.description}
                onChange={(event) => update({ description: event.target.value })}
                maxLength={4000}
                rows={7}
                aria-invalid={Boolean(error)}
                aria-describedby="description-hint"
              />
            </label>
            <p id="description-hint" className="hint">
              Нужно хотя бы несколько слов. Не указывайте пароли, коды из SMS и номера карт.
            </p>
            <label className="check" htmlFor="immediate">
              <input
                id="immediate"
                type="checkbox"
                checked={draft.immediateDanger}
                onChange={(event) => update({ immediateDanger: event.target.checked })}
              />
              Это происходит прямо сейчас
            </label>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <label className="field" htmlFor="platform">
              Где это было
              <select id="platform" value={draft.platform} onChange={(event) => update({ platform: event.target.value as DraftPlatform })}>
                {PLATFORMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="occurred">
              Когда это было
              <input
                id="occurred"
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(event) => update({ occurredAt: event.target.value })}
              />
            </label>
            <p className="hint">Если не помните точно — оставьте время пустым.</p>
            <label className="field" htmlFor="source">
              Ссылка, если есть
              <input
                id="source"
                type="url"
                inputMode="url"
                value={draft.sourceUrl}
                onChange={(event) => update({ sourceUrl: event.target.value })}
                placeholder="https://"
              />
            </label>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p className="hint">Пишите только то, что нужно для вашей карточки. Не отвечайте этому человеку и не публикуйте данные.</p>
            <label className="field" htmlFor="display-name">
              Имя, как оно показано
              <input id="display-name" value={draft.displayName} maxLength={200} onChange={(event) => update({ displayName: event.target.value })} />
            </label>
            <label className="field" htmlFor="username">
              Имя пользователя
              <input id="username" value={draft.username} maxLength={200} onChange={(event) => update({ username: event.target.value })} />
            </label>
            <label className="field" htmlFor="suspect-channel">
              Канал или чат
              <input id="suspect-channel" value={draft.suspectChannel} maxLength={200} onChange={(event) => update({ suspectChannel: event.target.value })} />
            </label>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <label className="field" htmlFor="demand">
              Чего добивались
              <select id="demand" value={draft.demandsKind} onChange={(event) => update({ demandsKind: event.target.value as DraftDemand })}>
                {DEMANDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="demand-summary">
              Коротко, что просили
              <textarea
                id="demand-summary"
                rows={4}
                maxLength={1000}
                value={draft.demandsSummary}
                onChange={(event) => update({ demandsSummary: event.target.value })}
              />
            </label>
            <p className="hint">Не выполняйте требования и не продолжайте переписку.</p>
            <label className="check" htmlFor="complied">
              <input id="complied" type="checkbox" checked={draft.userComplied} onChange={(event) => update({ userComplied: event.target.checked })} />
              Я уже что-то отправил или выполнил
            </label>
          </>
        ) : null}
        {step === 4 ? (
          <>
            <p className="hint">Файлы можно не прикладывать: описание тоже фиксирует ситуацию. Оригиналы оставьте у себя.</p>
            <label className="button ghost file-picker" htmlFor="evidence">
              Добавить файлы
              <input
                id="evidence"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain"
                onChange={(event) => onFiles(event.target.files)}
              />
            </label>
            {files.length === 0 ? <p className="state state-empty">Файлы пока не добавлены. Это нормально.</p> : null}
            {files.length > 0 ? (
              <ul className="file-list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, item) => item !== index))}>
                      Убрать
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="check" htmlFor="confirmed">
              <input
                id="confirmed"
                type="checkbox"
                checked={draft.evidenceConfirmed}
                onChange={(event) => update({ evidenceConfirmed: event.target.checked })}
              />
              Я не прикладываю интимные материалы, пароли, коды из SMS и данные карт
            </label>
          </>
        ) : null}
        {step === 5 ? (
          <>
            <article className="ticket">
              <p className="eyebrow">Черновик</p>
              <h2>{categoryTitle(draft.category)}</h2>
              <p>{draft.description}</p>
            </article>
            <label className="check" htmlFor="consent">
              <input
                id="consent"
                type="checkbox"
                checked={draft.contactConsent}
                onChange={(event) => update({ contactConsent: event.target.checked })}
              />
              Сохранить мой контакт в карточке
            </label>
            <p className="hint">Контакт попадёт в PDF для вас. Сервис сам не передаёт заявление в МВД и не обещает, что с вами свяжутся.</p>
            {draft.contactConsent ? (
              <>
                <label className="field" htmlFor="channel">
                  Канал
                  <select
                    id="channel"
                    value={draft.contactChannel}
                    onChange={(event) => update({ contactChannel: event.target.value as DraftContact })}
                  >
                    <option value="">Выберите</option>
                    <option value="telegram">Telegram</option>
                    <option value="phone">Телефон</option>
                    <option value="email">Почта</option>
                  </select>
                </label>
                <label className="field" htmlFor="contact-value">
                  Контакт
                  <input
                    id="contact-value"
                    type={draft.contactChannel === "email" ? "email" : draft.contactChannel === "phone" ? "tel" : "text"}
                    autoComplete="off"
                    value={draft.contactValue}
                    onChange={(event) => update({ contactValue: event.target.value })}
                  />
                </label>
              </>
            ) : null}
          </>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sticky-actions">
          {step > 0 ? (
            <button type="button" className="button ghost" onClick={() => update({ step: step - 1 })}>
              Назад
            </button>
          ) : null}
          <button className="button primary" type="submit" disabled={!canContinue || busy}>
            {busy ? "Сохраняем карточку" : step === 5 ? "Сохранить карточку" : "Дальше"}
          </button>
        </div>
        {!canContinue && step === 0 ? <p className="hint">Кнопка включится, когда описания будет достаточно.</p> : null}
      </form>
    </Screen>
  );
}

type DraftPlatform = (typeof PLATFORMS)[number]["id"];
type DraftDemand = (typeof DEMANDS)[number]["id"];
type DraftContact = "telegram" | "phone" | "email";
