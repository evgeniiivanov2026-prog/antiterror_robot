import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTelegramLifecycle } from "../hooks/useTelegram";

const BackContext = createContext<(handler: (() => void) | null) => void>(() => undefined);

export function useRegisterBack(handler: () => void) {
  const register = useContext(BackContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    register(() => ref.current());
    return () => register(null);
  }, [register]);
}

export function Shell({ children }: { children: ReactNode }) {
  useTelegramLifecycle();
  const navigate = useNavigate();
  const location = useLocation();
  const backRef = useRef<(() => void) | null>(null);
  const register = useCallback((handler: (() => void) | null) => {
    backRef.current = handler;
  }, []);

  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) return;
    const onBack = () => {
      if (backRef.current) backRef.current();
      else if (location.pathname !== "/") navigate(-1);
    };
    if (location.pathname === "/") {
      back.hide();
      return;
    }
    back.onClick(onBack);
    back.show();
    return () => back.offClick(onBack);
  }, [location.pathname, navigate]);

  return (
    <BackContext.Provider value={register}>
      <a className="skip" href="#content">
        К содержанию
      </a>
      <div className="app">{children}</div>
    </BackContext.Provider>
  );
}
