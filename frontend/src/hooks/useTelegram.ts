import { useEffect, useRef } from "react";

const THEME_MAP: Record<string, string> = {
  bg_color: "--bg",
  text_color: "--text",
  hint_color: "--muted",
  secondary_bg_color: "--surface",
  button_color: "--accent",
  button_text_color: "--accent-text",
  link_color: "--link",
};

export function applyTheme(params: Record<string, string | undefined> | undefined): void {
  if (!params) return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_MAP)) {
    const value = params[key];
    if (value) root.style.setProperty(cssVar, value);
  }
}

export function useTelegram(): void {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    applyTheme(webApp.themeParams);
    try {
      if (webApp.themeParams.bg_color && webApp.setHeaderColor) {
        webApp.setHeaderColor(webApp.themeParams.bg_color);
      }
    } catch {
      // Older Telegram clients reject a custom header color.
    }
    const onTheme = () => applyTheme(webApp.themeParams);
    webApp.onEvent("themeChanged", onTheme);
    return () => webApp.offEvent("themeChanged", onTheme);
  }, []);
}

export function haptic(kind: "success" | "error" | "light"): void {
  const feedback = window.Telegram?.WebApp?.HapticFeedback;
  if (!feedback) return;
  if (kind === "light") feedback.impactOccurred("light");
  else feedback.notificationOccurred(kind);
}

export function useMainButton(text: string, onClick: () => void, enabled: boolean): void {
  const ref = useRef(onClick);
  ref.current = onClick;
  useEffect(() => {
    const button = window.Telegram?.WebApp?.MainButton;
    if (!button) return;
    button.setText(text);
    const wrapped = () => {
      haptic("light");
      ref.current();
    };
    button.onClick(wrapped);
    if (enabled) button.enable();
    else button.disable();
    button.show();
    return () => {
      button.offClick(wrapped);
      button.hide();
    };
  }, [enabled, text]);
}

export function useBackButton(onBack: (() => void) | null): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  const active = onBack !== null;
  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) return;
    if (!active) {
      back.hide();
      return;
    }
    const wrapped = () => ref.current?.();
    back.onClick(wrapped);
    back.show();
    return () => {
      back.offClick(wrapped);
      back.hide();
    };
  }, [active]);
}
