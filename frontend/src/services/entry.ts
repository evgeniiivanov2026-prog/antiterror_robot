export function wantsAdminScreen(): boolean {
  const query = new URLSearchParams(window.location.search).get("screen")
  const start = window.WebApp?.initDataUnsafe?.start_param || window.Telegram?.WebApp?.initDataUnsafe?.start_param
  return query === "admin" || start === "admin"
}
