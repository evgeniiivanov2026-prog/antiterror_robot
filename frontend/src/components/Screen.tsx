import { useEffect, useRef, type ReactNode } from "react"

export function Screen({
  title,
  lede,
  children,
  tone = "default",
}: {
  title: string
  lede?: string
  children: ReactNode
  tone?: "default" | "alert" | "staff"
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [title])
  return (
    <main className={tone === "alert" ? "screen screen-alert" : "screen"}>
      <p className="kicker">{tone === "alert" ? "Прямо сейчас" : tone === "staff" ? "Служба" : "Орбита"}</p>
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {lede ? <p className="lede">{lede}</p> : null}
      {children}
    </main>
  )
}
