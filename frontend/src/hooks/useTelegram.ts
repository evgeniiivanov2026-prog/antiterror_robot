import { useEffect, useRef } from "react";
import type { ThemeParams } from "../types/telegram";

export function applyTheme(params?: ThemeParams, scheme?: string) {
  const root = document.documentElement;
  root.dataset.theme = scheme === "dark" ? "dark" : "light";
  const color = root.dataset.theme === "dark" ? "#14181d" : "#efe6d6";
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", params?.bg_color || color);
  if (!params) return;
  const pairs: [string, string | undefined][] = [
    ["--bg", params.bg_color],
    ["--bg-elevated", params.secondary_bg_color],
    ["--ink", params.text_color],
    ["--ink-soft", params.hint_color],
    ["--accent", params.button_color],
    ["--accent-ink", params.button_text_color],
    ["--line", params.section_separator_color],
  ];
  for (const [name, value] of pairs) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
}

export function haptic(kind: "light" | "success" | "warning") {
  const feedback = window.Telegram?.WebApp?.HapticFeedback;
  if (!feedback) return;
  if (kind === "light") feedback.impactOccurred("light");
  else feedback.notificationOccurred(kind);
}

export function useTelegramLifecycle() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      applyTheme(undefined, dark ? "dark" : "light");
      return;
    }
    document.documentElement.classList.add("is-telegram");
    webApp.ready();
    webApp.expand();
    applyTheme(webApp.themeParams, webApp.colorScheme);
    const background = webApp.themeParams.bg_color;
    if (background) {
      webApp.setHeaderColor?.(background);
      webApp.setBackgroundColor?.(background);
    }
    const onTheme = () => applyTheme(webApp.themeParams, webApp.colorScheme);
    webApp.onEvent?.("themeChanged", onTheme);
    return () => {
      webApp.offEvent?.("themeChanged", onTheme);
      document.documentElement.classList.remove("is-telegram");
    };
  }, []);
}

export function useMainButton(text: string, enabled: boolean, onClick: () => void) {
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  useEffect(() => {
    const button = window.Telegram?.WebApp?.MainButton;
    if (!button) return;
    button.setText(text);
    const handle = () => onClickRef.current();
    button.onClick(handle);
    if (enabled) button.enable();
    else button.disable();
    button.show();
    return () => {
      button.offClick(handle);
      button.hide();
    };
  }, [enabled, text]);
}
