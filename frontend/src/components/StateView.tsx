export function StateView({ kind, children }: { kind: "loading" | "error" | "success" | "empty"; children: string }) {
  return (
    <p className={kind === "loading" || kind === "empty" ? "note" : kind} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  )
}
