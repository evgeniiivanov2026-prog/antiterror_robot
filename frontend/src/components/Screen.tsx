import type { ReactNode } from "react";
import { Reminder } from "./Reminder";

export function Screen({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <main className="screen" id="content">
      <header>
        <p className="eyebrow">AntiTerror Robot</p>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </header>
      {children}
      <Reminder />
    </main>
  );
}
