import { useEffect, useRef } from "react"
import type { ThemeParams } from "../types/telegram"

function applyTheme(params: ThemeParams | undefined, scheme: "light" | "dark") {
  const root = document.documentElement
  root.dataset.scheme = scheme
  const map: Partial<Record<keyof ThemeParams, string>> = {
    link_color: "--tg-link",
    button_color: "--tg-button",
    button_text_color: "--tg-button-text",
  }
  ;(Object.keys(map) as (keyof ThemeParams)[]).forEach((key) => {
    const cssVar = map[key]
    const value = params?.[key]
    if (cssVar && value) root.style.setProperty(cssVar, value)
    else if (cssVar) root.style.removeProperty(cssVar)
  })
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", scheme === "dark" ? "#070814" : "#f4f0ff")
}

function hostApp() {
  if (window.WebApp?.initData) return window.WebApp
  return window.Telegram?.WebApp
}

export function useTelegram() {
  useEffect(() => {
    const tg = hostApp()
    tg?.ready?.()
    tg?.expand?.()
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    const apply = () => {
      const current = hostApp()
      const inTelegram = Boolean(current?.initData)
      const scheme =
        current?.colorScheme === "dark" || (!current?.colorScheme && media?.matches) ? "dark" : "light"
      applyTheme(inTelegram ? current?.themeParams : undefined, scheme)
    }
    apply()
    tg?.onEvent?.("themeChanged", apply)
    media?.addEventListener("change", apply)
    return () => {
      tg?.offEvent?.("themeChanged", apply)
      media?.removeEventListener("change", apply)
    }
  }, [])

  return { inTelegram: Boolean(hostApp()?.initData) }
}

export function haptic(kind: "select" | "success" | "error" | "warning") {
  const feedback = hostApp()?.HapticFeedback
  if (!feedback) return
  if (kind === "select") feedback.selectionChanged()
  else feedback.notificationOccurred(kind)
}

export function useBackButton(visible: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    const button = hostApp()?.BackButton
    if (!button) return
    const handler = () => onBackRef.current()
    if (visible) {
      button.show()
      button.onClick(handler)
    } else {
      button.hide()
    }
    return () => button.offClick(handler)
  }, [visible])
}

export function useMainButton(action: { visible: boolean; text: string; disabled?: boolean; onClick: () => void }) {
  const onClickRef = useRef(action.onClick)
  onClickRef.current = action.onClick
  useEffect(() => {
    const button = hostApp()?.MainButton
    if (!button?.setText || !button.enable || !button.disable) return
    const handler = () => onClickRef.current()
    if (!action.visible) {
      button.hide()
      return
    }
    button.setText(action.text)
    if (action.disabled) button.disable()
    else button.enable()
    button.onClick(handler)
    button.show()
    return () => {
      button.offClick(handler)
      button.hide()
    }
  }, [action.visible, action.text, action.disabled])
}
