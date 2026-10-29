import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

export const ONBOARDING_STORAGE_KEY = "score-to-musicxml:onboarding:v1";
const STORAGE_READY_TIMEOUT_MS = 2_000;
export type OnboardingFinishReason = "completed" | "skipped";

type OnboardingContextValue = {
  isReady: boolean;
  visible: boolean;
  openGuide: () => void;
  finish: (reason: OnboardingFinishReason) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/** The guide belongs to this installation, rather than the signed-in account. */
export function OnboardingProvider({ children }: PropsWithChildren) {
  const [isReady, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const userActed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    const settle = (show: boolean) => {
      if (cancelled || settled) return;
      settled = true;
      clearTimeout(timer);
      if (userActed.current) return;
      setVisible(show);
      setReady(true);
    };
    // A storage failure must never keep the launch screen or login blocked.
    const timer = setTimeout(() => settle(false), STORAGE_READY_TIMEOUT_MS);
    void Promise.resolve().then(() => AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)).then(
      (value) => settle(value !== "completed" && value !== "skipped"),
      () => settle(false)
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const openGuide = useCallback(() => {
    userActed.current = true;
    setReady(true);
    setVisible(true);
  }, []);

  const finish = useCallback((reason: OnboardingFinishReason) => {
    userActed.current = true;
    setVisible(false);
    setReady(true);
    // Close immediately even if the device cannot save its local preference.
    void Promise.resolve().then(() => AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, reason)).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ isReady, visible, openGuide, finish }), [finish, isReady, openGuide, visible]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding requires OnboardingProvider");
  return context;
}
