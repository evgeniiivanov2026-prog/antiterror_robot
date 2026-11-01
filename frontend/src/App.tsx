import { useEffect, useRef, useState } from "react"
import { FALLBACK_CATEGORIES } from "./content/copy"
import { useBackButton, useMainButton, useTelegram, haptic } from "./hooks/useTelegram"
import { api } from "./services/api"
import { clearDraft, loadDraft, saveDraft } from "./services/draft"
import type { CategoryInfo, Draft, IncidentCard } from "./types/incident"
import { emptyDraft } from "./types/incident"
import { CategoryPage } from "./pages/CategoryPage"
import { ContactsPage } from "./pages/ContactsPage"
import { EmergencyPage } from "./pages/EmergencyPage"
import { EvidenceGuidePage } from "./pages/EvidenceGuidePage"
import { HomePage } from "./pages/HomePage"
import { ReportWizard } from "./pages/ReportWizard"
import { ResultPage } from "./pages/ResultPage"

type ScreenName = "home" | "category" | "wizard" | "emergency" | "evidence" | "contacts" | "result"

interface PrimaryAction {
  text: string
  disabled: boolean
  onClick: () => void
}

export function App() {
  useTelegram()
  const [stack, setStack] = useState<ScreenName[]>(["home"])
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? emptyDraft())
  const [categories, setCategories] = useState<CategoryInfo[]>(FALLBACK_CATEGORIES)
  const [disclaimer, setDisclaimer] = useState("")
  const [offline, setOffline] = useState(false)
  const [card, setCard] = useState<IncidentCard | null>(null)
  const [safetyAck, setSafetyAck] = useState(false)
  const [primary, setPrimary] = useState<PrimaryAction | null>(null)
  const screen = stack[stack.length - 1]

  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  useEffect(() => {
    let cancelled = false
    api
      .categories()
      .then((payload) => {
        if (cancelled) return
        setCategories(payload.categories)
        setDisclaimer(payload.disclaimer)
      })
      .catch(() => {
        if (!cancelled) setOffline(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function push(next: ScreenName) {
    setStack((current) => [...current, next])
  }

  function pop() {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  }

  const emergencyLock = useRef(false)
  function openEmergency() {
    setStack((current) => (current[current.length - 1] === "emergency" ? current : [...current, "emergency"]))
    if (emergencyLock.current) return
    emergencyLock.current = true
    haptic("warning")
    void api.notifyEmergency().catch(() => undefined)
    window.setTimeout(() => {
      emergencyLock.current = false
    }, 400)
  }

  function continueAfterSafety() {
    setSafetyAck(true)
    setStack((current) => {
      const previous = current[current.length - 2]
      if (previous === "wizard") return current.slice(0, -1)
      if (draft.category) return [...current.slice(0, -1), "wizard"]
      return [...current.slice(0, -1), "category"]
    })
  }

  useBackButton(stack.length > 1 && screen !== "result", () => {
    if (screen === "wizard" && draft.step > 0) {
      setDraft((current) => ({ ...current, step: current.step - 1 }))
      return
    }
    pop()
  })

  useMainButton({
    visible: screen === "home" || (screen === "wizard" && primary !== null),
    text: screen === "home" ? "Сообщить о происшествии" : primary?.text || "Далее",
    disabled: screen === "wizard" ? primary?.disabled : false,
    onClick: () => {
      if (screen === "home") {
        haptic("select")
        push("category")
        return
      }
      primary?.onClick()
    },
  })

  return (
    <div className="app">
      {screen === "home" ? (
        <HomePage
          onReport={() => push("category")}
          onEmergency={openEmergency}
          onEvidence={() => push("evidence")}
          onContacts={() => push("contacts")}
        />
      ) : null}
      {screen === "category" ? (
        <CategoryPage
          categories={categories}
          disclaimer={disclaimer}
          offline={offline}
          onSelect={(category) => {
            haptic("select")
            setDraft((current) => ({ ...current, category: category.id, step: 0 }))
            if (category.emergency) openEmergency()
            else push("wizard")
          }}
        />
      ) : null}
      {screen === "wizard" ? (
        <ReportWizard
          draft={draft}
          onChange={setDraft}
          safetyAck={safetyAck}
          onDanger={openEmergency}
          onCreated={(created) => {
            clearDraft()
            setCard(created)
            setStack(["home", "result"])
            haptic("success")
          }}
          registerAction={setPrimary}
        />
      ) : null}
      {screen === "emergency" ? <EmergencyPage onContinue={continueAfterSafety} /> : null}
      {screen === "evidence" ? <EvidenceGuidePage /> : null}
      {screen === "contacts" ? <ContactsPage /> : null}
      {screen === "result" && card ? (
        <ResultPage
          card={card}
          onChange={setCard}
          onDeleted={() => {
            setCard(null)
            setDraft(emptyDraft())
            setStack(["home"])
          }}
        />
      ) : null}
    </div>
  )
}
