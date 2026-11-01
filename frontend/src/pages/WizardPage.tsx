import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { ProgressBar } from "../components/ProgressBar";
import { SafetyFooter } from "../components/SafetyFooter";
import {
  toReportPayload,
  validateContact,
  validateDescription,
  validateOccurredAt,
  validatePlatform,
  validateUrl,
} from "../domain/draft";
import { findSecret, hasDangerSignal } from "../domain/safety";
import { useDraft } from "../hooks/useDraft";
import { haptic, useBackButton, useMainButton } from "../hooks/useTelegram";
import { ApiError, createReport, getReport, uploadEvidence } from "../services/api";
import { ContactStep } from "./wizard/ContactStep";
import { ContextStep } from "./wizard/ContextStep";
import { DemandsStep } from "./wizard/DemandsStep";
import { DescriptionStep } from "./wizard/DescriptionStep";
import { EvidenceStep } from "./wizard/EvidenceStep";
import { SuspectStep } from "./wizard/SuspectStep";

const TITLES = [
  "Что произошло",
  "Когда и где",
  "Кто вышел на связь",
  "Что требовали",
  "Доказательства",
  "Обратная связь",
];

export function WizardPage() {
  const navigate = useNavigate();
  const { draft, update, reset, restored, dismissRestored, dangerAcknowledged } = useDraft();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filesConfirmed, setFilesConfirmed] = useState(false);

  useEffect(() => {
    document.title = "Сообщение — AntiTerror Robot";
  }, []);

  useEffect(() => {
    if (!draft.category) navigate("/category", { replace: true });
  }, [draft.category, navigate]);

  function back() {
    setError(null);
    if (step === 0) {
      navigate("/category");
      return;
    }
    setStep((current) => current - 1);
  }

  useBackButton(back);

  async function submit() {
    if (!draft.category) {
      navigate("/category");
      return;
    }
    const contactError = validateContact(draft);
    if (contactError) {
      setError(contactError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const report = await createReport(toReportPayload(draft));
      let warning: string | null = null;
      for (const file of draft.files) {
        try {
          await uploadEvidence(report.id, file);
        } catch {
          warning = "Карточка сохранена, но не все файлы удалось прикрепить.";
          break;
        }
      }
      const fresh = await getReport(report.public_id).catch(() => report);
      reset();
      haptic("success");
      navigate(`/result/${fresh.public_id}`, { state: { warning } });
    } catch (caught) {
      haptic("error");
      setError(caught instanceof ApiError ? caught.message : "Не получилось сохранить карточку.");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    const message = validateStep(step, draft, filesConfirmed);
    if (message) {
      setError(message);
      return;
    }
    if (step === 0 && hasDangerSignal(draft.description) && !dangerAcknowledged) {
      navigate("/emergency?returnTo=/report");
      return;
    }
    setError(null);
    if (step < TITLES.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    void submit();
  }

  const label = step === TITLES.length - 1 ? "Сохранить карточку" : "Далее";
  useMainButton(label, next, !loading);

  return (
    <form
      className="stack"
      noValidate
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        next();
      }}
    >
      <div>
        <p className="eyebrow">
          Шаг {step + 1} из {TITLES.length}
        </p>
        <h1>{TITLES[step]}</h1>
      </div>
      <ProgressBar step={step + 1} total={TITLES.length} />
      {restored ? (
        <div className="note" role="status">
          <p>Черновик восстановлен. Контакт для связи в нём не хранится.</p>
          <div className="row">
            <Button variant="ghost" onClick={dismissRestored}>
              Скрыть
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                navigate("/category");
              }}
            >
              Очистить черновик
            </Button>
          </div>
        </div>
      ) : null}
      {step === 0 ? (
        <DescriptionStep
          draft={draft}
          errorId={error ? "step-error" : undefined}
          onChange={(description) => update({ description })}
        />
      ) : null}
      {step === 1 ? <ContextStep draft={draft} onChange={update} /> : null}
      {step === 2 ? <SuspectStep draft={draft} onChange={(suspect) => update({ suspect })} /> : null}
      {step === 3 ? <DemandsStep demands={draft.demands} onChange={(demands) => update({ demands })} /> : null}
      {step === 4 ? (
        <EvidenceStep
          files={draft.files}
          confirmed={filesConfirmed}
          onChange={(files) => update({ files })}
          onConfirm={setFilesConfirmed}
          onError={setError}
        />
      ) : null}
      {step === 5 ? <ContactStep draft={draft} onChange={update} /> : null}
      {error ? (
        <p id="step-error" className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <Button variant="ghost" onClick={back} disabled={loading}>
          Назад
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Сохраняем…" : label}
        </Button>
      </div>
      <SafetyFooter />
    </form>
  );
}

function validateStep(
  step: number,
  draft: Parameters<typeof validatePlatform>[0],
  filesConfirmed: boolean,
): string | null {
  if (step === 0) return validateDescription(draft.description);
  if (step === 1) return validatePlatform(draft) ?? validateOccurredAt(draft.occurredAt) ?? validateUrl(draft.sourceUrl);
  if (step === 2) {
    for (const value of Object.values(draft.suspect)) {
      const secret = findSecret(value);
      if (secret) return secret;
    }
    return null;
  }
  if (step === 3) return findSecret(draft.demands.summary);
  if (step === 4 && draft.files.length > 0 && !filesConfirmed) {
    return "Подтвердите, что в файлах нет паролей, кодов, данных карт и интимных материалов.";
  }
  if (step === 5) return validateContact(draft);
  return null;
}
