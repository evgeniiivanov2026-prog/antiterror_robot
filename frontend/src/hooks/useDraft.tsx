import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  clearStoredDraft,
  emptyDraft,
  hasMeaningfulDraft,
  loadStoredDraft,
  saveStoredDraft,
  type Draft,
} from "../domain/draft";

interface DraftContextValue {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  reset: () => void;
  restored: boolean;
  dismissRestored: () => void;
  dangerAcknowledged: boolean;
  acknowledgeDanger: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(() => loadStoredDraft());
  const [restored, setRestored] = useState(() => hasMeaningfulDraft(loadStoredDraft()));
  const [dangerAcknowledged, setDangerAcknowledged] = useState(false);

  useEffect(() => {
    if (!hasMeaningfulDraft(draft)) {
      clearStoredDraft();
      return;
    }
    saveStoredDraft(draft);
  }, [draft]);

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    clearStoredDraft();
    setDraft(emptyDraft());
    setRestored(false);
    setDangerAcknowledged(false);
  }, []);

  const value = useMemo(
    () => ({
      draft,
      update,
      reset,
      restored,
      dismissRestored: () => setRestored(false),
      dangerAcknowledged,
      acknowledgeDanger: () => setDangerAcknowledged(true),
    }),
    [dangerAcknowledged, draft, reset, restored, update],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error("DraftProvider is missing");
  return value;
}
