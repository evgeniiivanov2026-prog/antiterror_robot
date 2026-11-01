export type ThemeParams = {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  button_color?: string;
  button_text_color?: string;
  section_separator_color?: string;
};

export type TelegramButton = {
  setText: (text: string) => void;
  onClick: (handler: () => void) => void;
  offClick: (handler: () => void) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
};

export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  colorScheme?: "light" | "dark";
  themeParams: ThemeParams;
  initData?: string;
  MainButton: TelegramButton;
  BackButton: TelegramButton;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
