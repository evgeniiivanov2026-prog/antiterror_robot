import { useEffect, useRef, type ReactNode } from "react"

export function Screen({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [title])
  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {lede ? <p className="lede">{lede}</p> : null}
      {children}
    </main>
  )
}
