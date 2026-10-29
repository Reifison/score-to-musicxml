import { t, useTranslation } from "../i18n";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useAdaptiveLayout } from "../adaptive/useAdaptiveLayout";
import { AdaptiveText as Text, AdaptiveTypographyProvider } from "../adaptive/AdaptiveTypography";
import { AdaptiveNavigation } from "./AdaptiveNavigation";
import { colors, screenGutter } from "../theme/styles";

type ReaderViewport = { height: number; suspended: boolean; fontScale: number };

export function ScoreReaderLayout({ title, notice, details, children }: {
  title: string;
  notice?: ReactNode | ((openDetails: () => void) => ReactNode);
  details: ReactNode;
  children: (viewport: ReaderViewport) => ReactNode;
}) {
  useTranslation();
  const layout = useAdaptiveLayout();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rail = layout.navigationMode === "rail";
  const overlayOpen = detailsOpen && !layout.sideBySide;
  const availableHeight = Math.max(1, layout.contentFrame.height - headerHeight);
  const height = viewportHeight > 0 ? Math.min(viewportHeight, availableHeight) : availableHeight;
  const back = () => router.canGoBack() ? router.back() : router.replace("/scores");

  return (
    <AdaptiveTypographyProvider fontScale={layout.fontScale}>
    <View style={styles.screen}>
      <View style={[styles.content, { left: layout.contentFrame.x, top: layout.contentFrame.y, width: layout.contentFrame.width, height: layout.contentFrame.height }]}>
        <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)} style={styles.header}>
          {layout.navigationMode === "bottom" ? (
            <Pressable accessibilityLabel={t("Voltar para partituras", "Back to scores")} accessibilityRole="button" onPress={back} style={styles.iconButton}>
              <Ionicons color={colors.ink} name="chevron-back" size={24} />
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {!rail ? (
            <Pressable
              accessibilityLabel={detailsOpen ? t("Fechar detalhes da partitura", "Close score details") : t("Abrir detalhes da partitura", "Open score details")}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen((open) => !open)}
              style={[styles.detailsButton, detailsOpen && styles.selectedButton]}
            >
              <Ionicons color={colors.primaryDark} name={detailsOpen ? "close-outline" : "options-outline"} size={23} />
              {!layout.low && <Text style={styles.detailsLabel}>{t("Detalhes", "Details")}</Text>}
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.workspace, layout.sideBySide && styles.workspaceWide]}>
          <View
            accessibilityElementsHidden={overlayOpen}
            importantForAccessibility={overlayOpen ? "no-hide-descendants" : "auto"}
            pointerEvents={overlayOpen ? "none" : "auto"}
            style={styles.reading}
          >
            {typeof notice === "function" ? notice(() => setDetailsOpen(true)) : notice}
            <View onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)} style={styles.viewport}>
              {children({ height, suspended: overlayOpen, fontScale: layout.fontScale })}
            </View>
          </View>
          {detailsOpen ? (
            <View
              // Keep the rail's close action reachable by VoiceOver while the
              // player subtree is suspended behind the details overlay.
              accessibilityViewIsModal={overlayOpen && !rail}
              style={[styles.detailsPanel, layout.sideBySide ? { width: layout.panelWidth } : styles.overlayPanel]}
            >
              <ScrollView contentContainerStyle={styles.detailsContent} keyboardShouldPersistTaps="handled">
                <View style={styles.panelHeading}>
                  <Text accessibilityRole="header" style={styles.panelTitle}>{t("Sobre a partitura", "About this score")}</Text>
                  {!rail ? (
                    <Pressable accessibilityLabel={t("Fechar painel de detalhes", "Close details panel")} accessibilityRole="button" onPress={() => setDetailsOpen(false)} style={styles.iconButton}>
                      <Ionicons color={colors.ink} name="close-outline" size={24} />
                    </Pressable>
                  ) : null}
                </View>
                {details}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
      <AdaptiveNavigation
        back
        backLabel={t("Voltar para partituras", "Back to scores")}
        layout={layout}
        onBack={back}
        readerDetails={{ open: detailsOpen, onToggle: () => setDetailsOpen((open) => !open) }}
      />
    </View>
    </AdaptiveTypographyProvider>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  content: { position: "absolute", overflow: "hidden" },
  header: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 8, minHeight: 56, paddingHorizontal: screenGutter, paddingVertical: 4 },
  title: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: "700", lineHeight: 23 },
  iconButton: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  detailsButton: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 48, minWidth: 48, paddingHorizontal: 10 },
  detailsLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: "700" },
  selectedButton: { backgroundColor: colors.primarySoft },
  workspace: { flex: 1, minHeight: 0 },
  workspaceWide: { flexDirection: "row" },
  reading: { flex: 1, minHeight: 0, minWidth: 0 },
  viewport: { flex: 1, minHeight: 0, overflow: "hidden" },
  detailsPanel: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1 },
  overlayPanel: { ...StyleSheet.absoluteFillObject },
  detailsContent: { gap: 20, padding: 16, paddingBottom: 32 },
  panelHeading: { alignItems: "center", flexDirection: "row", gap: 8 },
  panelTitle: { color: colors.ink, flex: 1, fontSize: 20, fontWeight: "700" },

});
