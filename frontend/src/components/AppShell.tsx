import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Mark } from "./Mark";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <a className="skip" href="#content">
        К содержанию
      </a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="AntiTerror Robot, на главную">
          <Mark />
          <span>AntiTerror Robot</span>
        </Link>
      </header>
      <main id="content" className="screen">
        {children}
      </main>
    </div>
  );
}
