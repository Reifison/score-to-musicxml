import { createContext, forwardRef, useContext, type PropsWithChildren } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle
} from "react-native";

const WindowFontScale = createContext<number | undefined>(undefined);
const InsideText = createContext(false);

/**
 * UIKit can give one window a content-size trait different from the app-wide
 * category read by Fabric. Use that window's scale for both text and layout.
 * Scaling is explicit here, so native automatic scaling must not apply twice.
 */
export function AdaptiveTypographyProvider({ fontScale, children }: PropsWithChildren<{ fontScale: number }>) {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return <WindowFontScale.Provider value={scale}>{children}</WindowFontScale.Provider>;
}

function scaledStyle(style: TextProps["style"], scale: number, defaultSize?: number): TextStyle {
  const base = StyleSheet.flatten(style) ?? {};
  const fontSize = base.fontSize ?? defaultSize;
  return {
    ...(fontSize === undefined ? {} : { fontSize: fontSize * scale }),
    ...(base.lineHeight === undefined ? {} : { lineHeight: base.lineHeight * scale }),
    ...(base.letterSpacing === undefined ? {} : { letterSpacing: base.letterSpacing * scale })
  };
}

export const AdaptiveText = forwardRef<NativeText, TextProps>(function AdaptiveText(
  { children, style, allowFontScaling, ...props },
  ref
) {
  const scale = useContext(WindowFontScale);
  const nested = useContext(InsideText);
  if (scale === undefined || allowFontScaling === false) {
    return <NativeText {...props} allowFontScaling={allowFontScaling} ref={ref} style={style}>{children}</NativeText>;
  }
  return (
    <NativeText {...props} allowFontScaling={false} ref={ref} style={[style, scaledStyle(style, scale, nested ? undefined : 14)]}>
      <InsideText.Provider value>{children}</InsideText.Provider>
    </NativeText>
  );
});

export const AdaptiveTextInput = forwardRef<NativeTextInput, TextInputProps>(function AdaptiveTextInput(
  { style, allowFontScaling, ...props },
  ref
) {
  const scale = useContext(WindowFontScale);
  if (scale === undefined || allowFontScaling === false) {
    return <NativeTextInput {...props} allowFontScaling={allowFontScaling} ref={ref} style={style} />;
  }
  return <NativeTextInput {...props} allowFontScaling={false} ref={ref} style={[style, scaledStyle(style, scale, 17)]} />;
});
