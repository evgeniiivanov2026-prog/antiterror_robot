export interface ThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

export interface TelegramButton {
  show: () => void
  hide: () => void
  onClick: (handler: () => void) => void
  offClick: (handler: () => void) => void
  setText?: (text: string) => void
  enable?: () => void
  disable?: () => void
}

export interface TelegramWebApp {
  ready: () => void
  expand: () => void
  initData: string
  initDataUnsafe?: { start_param?: string }
  colorScheme: "light" | "dark"
  themeParams: ThemeParams
  MainButton: TelegramButton
  BackButton: TelegramButton
  HapticFeedback?: {
    selectionChanged: () => void
    impactOccurred: (style: "light" | "medium" | "heavy") => void
    notificationOccurred: (type: "error" | "success" | "warning") => void
  }
  onEvent: (event: string, handler: () => void) => void
  offEvent: (event: string, handler: () => void) => void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
