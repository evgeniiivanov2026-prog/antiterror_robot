export function StateMessage({
  tone,
  title,
  children,
}: {
  tone: "loading" | "error" | "empty" | "success";
  title: string;
  children?: string;
}) {
  return (
    <div className={`state state-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <p className="state-title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
