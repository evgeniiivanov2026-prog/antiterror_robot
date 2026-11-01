import { Navigate, Route, Routes } from "react-router-dom";
import { CategoryPage } from "./pages/CategoryPage";
import { ContactsPage } from "./pages/ContactsPage";
import { EmergencyPage } from "./pages/EmergencyPage";
import { EvidenceGuidePage } from "./pages/EvidenceGuidePage";
import { HomePage } from "./pages/HomePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ReportWizardPage } from "./pages/ReportWizardPage";
import { ResultPage } from "./pages/ResultPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/category" element={<CategoryPage />} />
      <Route path="/report" element={<ReportWizardPage />} />
      <Route path="/emergency" element={<EmergencyPage />} />
      <Route path="/evidence-guide" element={<EvidenceGuidePage />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/result/:publicId" element={<ResultPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
