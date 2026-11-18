// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdaptiveText, AdaptiveTextInput, AdaptiveTypographyProvider } from "./AdaptiveTypography";

vi.mock("react-native", () => {
  const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : (style || {}) as Record<string, unknown>;
  return {
    StyleSheet: { flatten },
    Text: forwardRef<HTMLSpanElement, { children: ReactNode; style?: unknown; testID?: string; allowFontScaling?: boolean }>(
      ({ children, style, testID, allowFontScaling }, ref) => <span data-testid={testID} data-native-scale={String(allowFontScaling)} ref={ref} style={flatten(style)}>{children}</span>
    ),
    TextInput: forwardRef<HTMLInputElement, { value?: string; onChangeText?: (value: string) => void; style?: unknown; testID?: string; allowFontScaling?: boolean }>(
      ({ value, onChangeText, style, testID, allowFontScaling }, ref) => <input data-testid={testID} data-native-scale={String(allowFontScaling)} onChange={(event) => onChangeText?.(event.target.value)} ref={ref} style={flatten(style)} value={value} />
    )
  };
});

afterEach(cleanup);

describe("window typography", () => {
  it("updates text and input metrics without losing an edited value or remounting", () => {
    let mounts = 0;
    function Form() {
      const [value, setValue] = useState("");
      useEffect(() => { mounts += 1; }, []);
      return <>
        <AdaptiveText style={{ fontSize: 16, lineHeight: 22 }} testID="label">Nome</AdaptiveText>
        <AdaptiveTextInput onChangeText={setValue} style={{ fontSize: 16 }} testID="input" value={value} />
      </>;
    }
    const view = render(<AdaptiveTypographyProvider fontScale={1}><Form /></AdaptiveTypographyProvider>);
    const input = screen.getByTestId("input");
    fireEvent.change(input, { target: { value: "Estudo em Ré" } });
    view.rerender(<AdaptiveTypographyProvider fontScale={2.5}><Form /></AdaptiveTypographyProvider>);
    expect(screen.getByTestId("input")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Estudo em Ré");
    expect(input.style.fontSize).toBe("40px");
    expect(screen.getByTestId("label").style.fontSize).toBe("40px");
    expect(screen.getByTestId("label").getAttribute("data-native-scale")).toBe("false");
    expect(mounts).toBe(1);
  });

  it("lets nested text inherit size and uses native scaling outside a window provider", () => {
    const view = render(<AdaptiveTypographyProvider fontScale={2}><AdaptiveText style={{ fontSize: 20 }}>Arquivo <AdaptiveText testID="nested">original</AdaptiveText></AdaptiveText></AdaptiveTypographyProvider>);
    expect(screen.getByTestId("nested").style.fontSize).toBe("");
    view.rerender(<AdaptiveText style={{ fontSize: 20 }} testID="standalone">Arquivo</AdaptiveText>);
    expect(screen.getByTestId("standalone").style.fontSize).toBe("20px");
    expect(screen.getByTestId("standalone").getAttribute("data-native-scale")).toBe("undefined");
  });
});
