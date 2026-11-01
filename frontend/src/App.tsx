import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { DraftProvider } from "./hooks/useDraft";
import { useTelegram } from "./hooks/useTelegram";
import { CategoryPage } from "./pages/CategoryPage";
import { ContactsPage } from "./pages/ContactsPage";
import { EmergencyPage } from "./pages/EmergencyPage";
import { EvidenceGuidePage } from "./pages/EvidenceGuidePage";
import { HomePage } from "./pages/HomePage";
import { ResultPage } from "./pages/ResultPage";
import { WizardPage } from "./pages/WizardPage";

export function App() {
  useTelegram();
  return (
    <DraftProvider>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </DraftProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/category" element={<CategoryPage />} />
      <Route path="/report" element={<WizardPage />} />
      <Route path="/emergency" element={<EmergencyPage />} />
      <Route path="/evidence" element={<EvidenceGuidePage />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/result/:publicId" element={<ResultPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
