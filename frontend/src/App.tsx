import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";
import { Shell } from "./components/Shell";
import { DraftProvider } from "./hooks/useDraft";

export function App() {
  return (
    <DraftProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Shell>
          <AppRoutes />
        </Shell>
      </BrowserRouter>
    </DraftProvider>
  );
}
