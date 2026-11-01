import { useEffect, useRef, useState } from "react"
import { EVIDENCE_RULES, PLATFORMS } from "../content/copy"
import { ProgressBar } from "../components/ProgressBar"
import { SafetyBanner } from "../components/SafetyBanner"
import { Screen } from "../components/Screen"
import { StateView } from "../components/StateView"
import { api, ApiError } from "../services/api"
import { hasEmergencySignal } from "../services/safety"
import type { Draft, IncidentCard } from "../types/incident"

const TOTAL = 6
const LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024,
  document: 15 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 50 * 1024 * 1024,
}

function fileKind(file: File): keyof typeof LIMITS | null {
  if (file.type.startsWith("image/")) return "image"
  if (file.type === "application/pdf") return "document"
  if (file.type.startsWith("audio/")) return "audio"
  if (file.type.startsWith("video/")) return "video"
  return null
}

export function ReportWizard({
  draft,
  onChange,
  safetyAck,
  onDanger,
  onCreated,
  registerAction,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  safetyAck: boolean
  onDanger: () => void
  onCreated: (card: IncidentCard) => void
  registerAction: (action: { text: string; disabled: boolean; onClick: () => void } | null) => void
}) {
  const [contactValue, setContactValue] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const signal = hasEmergencySignal(`${draft.description}\n${draft.demands.summary}`)
  const onDangerRef = useRef(onDanger)
  onDangerRef.current = onDanger

  useEffect(() => {
    if (signal && !safetyAck) onDangerRef.current()
  }, [signal, safetyAck])

  function patch(partial: Partial<Draft>) {
    onChange({ ...draft, ...partial })
  }

  function validate(): string | null {
    if (draft.step === 0 && draft.description.trim().length < 10) {
      return "Опишите ситуацию хотя бы в одном-двух предложениях."
    }
    if (draft.step === 4 && files.length > 0 && !draft.evidenceConfirmed) {
      return "Подтвердите, что в файлах нет секретов и интимных материалов."
    }
    if (draft.step === 5 && draft.contactConsent) {
      if (!draft.contactChannel || contactValue.trim().length < 5) {
        return "Укажите канал и контакт или отключите обратную связь."
      }
    }
    return null
  }

  async function submit() {
    if (!draft.category) return
    setSubmitting(true)
    setError(null)
    const suspect = {
      platform: draft.suspect.platform || null,
      username: draft.suspect.username || null,
      display_name: draft.suspect.displayName || null,
      url: draft.suspect.url || null,
      phone: draft.suspect.phone || null,
      note: draft.suspect.note || null,
    }
    const hasSuspect = Object.values(suspect).some(Boolean)
    const demands = {
      summary: draft.demands.summary || null,
      money_requested: draft.demands.moneyRequested,
      meeting_requested: draft.demands.meetingRequested,
      intimate_material_requested: draft.demands.intimateMaterialRequested,
      secrecy_requested: draft.demands.secrecyRequested,
      other: draft.demands.other || null,
    }
    const hasDemands = Object.values(demands).some(Boolean)
    try {
      const card = await api.createReport({
        category: draft.category,
        description: draft.description.trim(),
        occurred_at: draft.occurredAt ? new Date(draft.occurredAt).toISOString() : null,
        platform: draft.platform,
        source_url: draft.sourceUrl.trim() || null,
        suspect_identifiers: hasSuspect ? suspect : null,
        demands: hasDemands ? demands : null,
        contact_consent: draft.contactConsent,
        contact_channel: draft.contactConsent ? draft.contactChannel : null,
        contact_value: draft.contactConsent ? contactValue.trim() : null,
      })
      for (const file of files) {
        await api.uploadEvidence(card.id, file)
      }
      onCreated(card)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить карточку")
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    if (draft.step === 5) {
      void submit()
      return
    }
    patch({ step: draft.step + 1 })
  }

  useEffect(() => {
    registerAction({
      text: draft.step === 5 ? "Сохранить карточку" : "Далее",
      disabled: submitting,
      onClick: next,
    })
    return () => registerAction(null)
    // next closes over the latest draft via the render that updates this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, submitting, contactValue, files, registerAction])

  return (
    <Screen title="Фиксация" lede="Один шаг за раз. Черновик сохраняется на этом устройстве, кроме контакта для связи.">
      <ProgressBar step={draft.step + 1} total={TOTAL} />
      <SafetyBanner />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          next()
        }}
      >
        {draft.step === 0 ? (
          <div className="field">
            <label htmlFor="description">Описание</label>
            <textarea
              id="description"
              name="description"
              value={draft.description}
              maxLength={4000}
              required
              aria-describedby="description-hint"
              onChange={(event) => patch({ description: event.target.value })}
            />
            <p className="hint" id="description-hint">
              Что случилось, кто написал и чего просил. Не вводите секрет из сообщения, код или номер карты.
            </p>
            <p className="counter">{draft.description.length} / 4000</p>
          </div>
        ) : null}
        {draft.step === 1 ? (
          <>
            <label className="field">
              <span>Когда это произошло</span>
              <input
                name="occurredAt"
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(event) => patch({ occurredAt: event.target.value })}
              />
              <span className="hint">Можно пропустить, если время неизвестно.</span>
            </label>
            <label className="field">
              <span>Платформа</span>
              <select name="platform" value={draft.platform} onChange={(event) => patch({ platform: event.target.value })}>
                <option value="">Не выбрано</option>
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ссылка</span>
              <input
                name="sourceUrl"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={draft.sourceUrl}
                maxLength={500}
                onChange={(event) => patch({ sourceUrl: event.target.value })}
              />
            </label>
          </>
        ) : null}
        {draft.step === 2 ? (
          <>
            <p className="hint">Укажите только публичные имя, ссылку или канал. Не пишите паспортные данные и чужие адреса.</p>
            <label className="field">
              <span>Имя пользователя</span>
              <input name="username" value={draft.suspect.username} maxLength={64} autoComplete="off" onChange={(event) => patch({ suspect: { ...draft.suspect, username: event.target.value } })} />
            </label>
            <label className="field">
              <span>Отображаемое имя</span>
              <input name="displayName" value={draft.suspect.displayName} maxLength={80} autoComplete="off" onChange={(event) => patch({ suspect: { ...draft.suspect, displayName: event.target.value } })} />
            </label>
            <label className="field">
              <span>Ссылка на аккаунт или канал</span>
              <input name="suspectUrl" type="url" value={draft.suspect.url} maxLength={500} onChange={(event) => patch({ suspect: { ...draft.suspect, url: event.target.value } })} />
            </label>
            <label className="field">
              <span>Телефон, с которого писали</span>
              <input name="suspectPhone" inputMode="tel" autoComplete="off" value={draft.suspect.phone} maxLength={20} onChange={(event) => patch({ suspect: { ...draft.suspect, phone: event.target.value } })} />
            </label>
          </>
        ) : null}
        {draft.step === 3 ? (
          <>
            <label className="field">
              <span>Что требовали</span>
              <textarea name="demands" value={draft.demands.summary} maxLength={1000} onChange={(event) => patch({ demands: { ...draft.demands, summary: event.target.value } })} />
              <span className="hint">Опишите требование своими словами. Сам секрет, код или реквизиты писать не нужно.</span>
            </label>
            {(
              [
                ["moneyRequested", "Просили деньги"],
                ["meetingRequested", "Звали на встречу"],
                ["secrecyRequested", "Просили никому не говорить"],
                ["intimateMaterialRequested", "Требовали интимные материалы"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={draft.demands[key]}
                  onChange={(event) => patch({ demands: { ...draft.demands, [key]: event.target.checked } })}
                />
                <span>{label}</span>
              </label>
            ))}
            {draft.demands.intimateMaterialRequested ? (
              <p className="note">Не отправляйте такие материалы никому. В карточку достаточно записать сам факт требования.</p>
            ) : null}
          </>
        ) : null}
        {draft.step === 4 ? (
          <>
            <label className="field">
              <span>Файлы</span>
              <input
                name="evidence"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/*,video/mp4,video/webm"
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? [])
                  const problem = selected
                    .map((file) => {
                      const kind = fileKind(file)
                      if (!kind) return "Этот тип файла нельзя приложить."
                      if (file.size > LIMITS[kind]) return "Один из файлов больше допустимого размера."
                      return null
                    })
                    .find(Boolean)
                  if (problem || selected.length > 8) {
                    setError(problem || "Можно приложить не больше 8 файлов.")
                    return
                  }
                  setError(null)
                  setFiles(selected)
                }}
              />
              <span className="hint">{EVIDENCE_RULES}</span>
            </label>
            {files.length === 0 ? <p className="note">Файлы можно не прикладывать. Карточка сохранится и без них.</p> : null}
            {files.length > 0 ? (
              <ul className="file-list">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`}>{file.name}</li>
                ))}
              </ul>
            ) : null}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.evidenceConfirmed}
                onChange={(event) => patch({ evidenceConfirmed: event.target.checked })}
              />
              <span>В файлах нет паролей, кодов, данных карты и интимных материалов</span>
            </label>
          </>
        ) : null}
        {draft.step === 5 ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.contactConsent}
                onChange={(event) => patch({ contactConsent: event.target.checked })}
              />
              <span>Можно связаться со мной по поводу этой карточки</span>
            </label>
            {draft.contactConsent ? (
              <>
                <label className="field">
                  <span>Канал связи</span>
                  <select
                    name="contactChannel"
                    value={draft.contactChannel}
                    onChange={(event) => patch({ contactChannel: event.target.value as Draft["contactChannel"] })}
                  >
                    <option value="">Выберите</option>
                    <option value="telegram">Telegram</option>
                    <option value="email">Эл. почта</option>
                    <option value="phone">Телефон</option>
                  </select>
                </label>
                <label className="field">
                  <span>Контакт для связи</span>
                  <input
                    name="contactValue"
                    autoComplete={draft.contactChannel === "email" ? "email" : "off"}
                    value={contactValue}
                    maxLength={254}
                    onChange={(event) => setContactValue(event.target.value)}
                  />
                  <span className="hint">Контакт шифруется и не попадает в копию для чата. Его можно удалить вместе с карточкой.</span>
                </label>
              </>
            ) : (
              <p className="note">Карточку можно сохранить без контакта. Мы не сможем написать вам первыми.</p>
            )}
          </>
        ) : null}
        {error ? <StateView kind="error">{error}</StateView> : null}
        {submitting ? <StateView kind="loading">Сохраняем карточку…</StateView> : null}
        <div className="actions">
          {draft.step > 0 ? (
            <button className="btn btn-quiet" type="button" disabled={submitting} onClick={() => patch({ step: draft.step - 1 })}>
              Назад
            </button>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {draft.step === 5 ? "Сохранить карточку" : "Далее"}
          </button>
        </div>
      </form>
    </Screen>
  )
}
