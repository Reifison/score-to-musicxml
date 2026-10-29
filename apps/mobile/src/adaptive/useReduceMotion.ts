import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Avoid motion while the initial accessibility preference is still unknown. */
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      preferenceChanged = true;
      if (active) setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}
