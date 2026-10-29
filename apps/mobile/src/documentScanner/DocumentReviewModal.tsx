import { t, useTranslation } from "../i18n";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { useReduceMotion } from "../adaptive/useReduceMotion";
import { AdaptiveScreen } from "../components/AdaptiveScreen";
import { colors, sharedStyles } from "../theme/styles";
import type { ReviewableCapture } from "./types";

export function DocumentReviewModal({
  capture,
  busy = false,
  error,
  onCancel,
  onConfirm
}: {
  capture: ReviewableCapture | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useTranslation();
  const reduceMotion = useReduceMotion();
  const [previewViewport, setPreviewViewport] = useState({ height: 0, width: 0 });

  function previewSize(page: ReviewableCapture["pages"][number]) {
    const ratio = page.width > 0 && page.height > 0 ? page.width / page.height : 0.75;
    const availableWidth = Math.max(120, Math.min(560, (previewViewport.width || 620) - 60));
    const availableHeight = Math.max(240, Math.min(480, (previewViewport.height || 560) - 96));
    const width = Math.min(availableWidth, Math.max(240, availableHeight * ratio));
    return { height: width / ratio, width };
  }

  return (
    <Modal animationType={reduceMotion ? "none" : "slide"} onRequestClose={onCancel} visible={Boolean(capture)}>
      {capture ? (
        <AdaptiveScreen navigation={false}>
          <View style={styles.header}>
            <Text style={sharedStyles.title}>{t("Conferir partitura", "Review score")}</Text>
            <Text style={sharedStyles.subtitle}>
              {capture.type === "application/pdf"
                ? t(capture.pageCount === 1 ? "{{count}} página no PDF. Todas serão enviadas na ordem exibida." : "{{count}} páginas no PDF. Todas serão enviadas na ordem exibida.", capture.pageCount === 1 ? "{{count}} page in the PDF. All pages will be uploaded in the order shown." : "{{count}} pages in the PDF. All pages will be uploaded in the order shown.", { count: capture.pageCount })
                : t("Confira a página antes de enviar.", "Check the page before uploading.")}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.pages}
            onLayout={(event) => setPreviewViewport({
              height: event.nativeEvent.layout.height,
              width: event.nativeEvent.layout.width
            })}
            style={styles.pageScroll}
          >
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {capture.pages.map((page, index) => (
              <View key={`${page.uri}-${index}`} style={styles.page}>
                <Text style={styles.pageLabel}>{t("Página {{page}}", "Page {{page}}", { page: index + 1 })}</Text>
                <Image
                  accessibilityLabel={t("Prévia da página {{page}}", "Page {{page}} preview", { page: index + 1 })}
                  resizeMode="contain"
                  source={{ uri: page.uri }}
                  style={[styles.preview, previewSize(page)]}
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.actionButton]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{busy ? t("Aguarde...", "Please wait...") : t("Refazer", "Retake")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={[sharedStyles.button, styles.actionButton]}>
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : null}
              <Text style={sharedStyles.buttonText}>{busy ? t("Enviando...", "Uploading...") : capture.type === "application/pdf" ? t("Enviar PDF", "Upload PDF") : t("Enviar", "Upload")}</Text>
            </Pressable>
          </View>
        </AdaptiveScreen>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 12 },
  actionButton: { flex: 1, minHeight: 52, minWidth: 120 },
  error: { alignSelf: "stretch", color: colors.danger, fontSize: 14, lineHeight: 20, marginHorizontal: 4 },
  header: { gap: 7, paddingHorizontal: 16, paddingTop: 10 },
  page: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 16, borderWidth: 1, gap: 9, padding: 12 },
  pageLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  pages: { alignItems: "center", gap: 14, padding: 12 },
  preview: { alignSelf: "center", backgroundColor: colors.surfaceSoft, borderRadius: 8 },
  pageScroll: { flex: 1, minHeight: 0 }
});

