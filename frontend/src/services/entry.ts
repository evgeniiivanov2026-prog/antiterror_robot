export function wantsAdminScreen(): boolean {
  const query = new URLSearchParams(window.location.search).get("screen")
  const start = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  return query === "admin" || start === "admin"
}
