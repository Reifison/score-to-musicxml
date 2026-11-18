import { t, useTranslation } from "../i18n";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AdaptiveText as Text, AdaptiveTypographyProvider } from "../adaptive/AdaptiveTypography";
import { useAdaptiveLayout } from "../adaptive/useAdaptiveLayout";
import { colors, screenGutter } from "../theme/styles";
import { AdaptiveNavigation, backToScores } from "./AdaptiveNavigation";

/** The child keeps its identity when window, posture, or text size changes. */
export function AdaptiveScreen({ children, title, back = false, navigation = true }: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  navigation?: boolean;
}) {
  useTranslation();
  const layout = useAdaptiveLayout();
  const frame = navigation ? layout.contentFrame : layout.frame;
  const inlineBack = back && (!navigation || layout.navigationMode === "bottom");

  return (
    <AdaptiveTypographyProvider fontScale={layout.fontScale}>
      <View style={styles.screen}>
        <View style={[styles.content, { left: frame.x, top: frame.y, width: frame.width, height: frame.height }]}>
          {title || inlineBack ? (
            <View style={styles.header}>
              {inlineBack && (
                <Pressable accessibilityLabel={t("Voltar", "Back")} accessibilityRole="button" onPress={backToScores} style={styles.back}>
                  <Ionicons color={colors.ink} name="chevron-back" size={24} />
                </Pressable>
              )}
              {title ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}
            </View>
          ) : null}
          <View style={styles.body}>{children}</View>
        </View>
        {navigation && <AdaptiveNavigation back={back} layout={layout} />}
      </View>
    </AdaptiveTypographyProvider>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  content: { overflow: "hidden", position: "absolute" },
  header: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 8, minHeight: 56, paddingHorizontal: screenGutter, paddingVertical: 4 },
  title: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: "700", lineHeight: 23 },
  back: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  body: { flex: 1, minHeight: 0, minWidth: 0 }
});
