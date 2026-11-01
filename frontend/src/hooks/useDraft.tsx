import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Draft } from "../types/report";

const KEY = "atr-draft-v1";

export const emptyDraft: Draft = {
  category: "",
  step: 0,
  description: "",
  occurredAt: "",
  platform: "telegram",
  sourceUrl: "",
  displayName: "",
  username: "",
  suspectChannel: "",
  demandsKind: "none",
  demandsSummary: "",
  userComplied: false,
  contactConsent: false,
  contactChannel: "",
  contactValue: "",
  evidenceConfirmed: false,
  immediateDanger: false,
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDraft;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...emptyDraft, ...parsed, step: Number(parsed.step) || 0 };
  } catch {
    return emptyDraft;
  }
}

type DraftApi = {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  clear: () => void;
};

const DraftContext = createContext<DraftApi | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(draft));
  }, [draft]);
  const api = useMemo<DraftApi>(
    () => ({
      draft,
      update: (patch) => setDraft((current) => ({ ...current, ...patch })),
      clear: () => {
        localStorage.removeItem(KEY);
        setDraft(emptyDraft);
      },
    }),
    [draft],
  );
  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftApi {
  const value = useContext(DraftContext);
  if (!value) throw new Error("DraftProvider is missing");
  return value;
}
