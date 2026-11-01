import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource/manrope/cyrillic-400.css"
import "@fontsource/manrope/latin-400.css"
import "@fontsource/manrope/cyrillic-600.css"
import "@fontsource/manrope/latin-600.css"
import "@fontsource/manrope/cyrillic-700.css"
import "@fontsource/manrope/latin-700.css"
import "@fontsource/unbounded/cyrillic-500.css"
import "@fontsource/unbounded/latin-500.css"
import "@fontsource/unbounded/cyrillic-700.css"
import "@fontsource/unbounded/latin-700.css"
import { App } from "./App"
import "./styles/global.css"

const root = document.getElementById("root")
if (!root) throw new Error("Root element is missing")
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
