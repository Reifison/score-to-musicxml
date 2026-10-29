import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ApiError, api } from "../api/client";
import type { Score, ScoreVersion } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { useTranslation } from "../i18n";
import { colors } from "../theme/styles";

export type ScoreVersionHistoryProps = {
  score: Score;
  onOpenVersion?: (version: ScoreVersion, musicXml: string) => void | Promise<void>;
};

type LoadState = "loading" | "ready" | "error";

export function ScoreVersionHistory({ score, onOpenVersion }: ScoreVersionHistoryProps) {
  const { t, language } = useTranslation();
  const { token, user } = useAuth();
  const [versions, setVersions] = useState<ScoreVersion[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [exportingId, setExportingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scoreRef = useRef(score);
  const selectedIdRef = useRef(selectedId);
  const tokenRef = useRef(token);
  const userIdRef = useRef(user?.id ?? null);
  const requestSequence = useRef(0);
  const exportSequence = useRef(0);
  const openControllerRef = useRef<AbortController | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  scoreRef.current = score;
  selectedIdRef.current = selectedId;
  tokenRef.current = token;
  userIdRef.current = user?.id ?? null;

  useLayoutEffect(() => () => {
    requestSequence.current += 1;
    exportSequence.current += 1;
    openControllerRef.current?.abort();
    exportControllerRef.current?.abort();
    openControllerRef.current = null;
    exportControllerRef.current = null;
  }, [score.id, score.reviewRevision, score.updatedAt, token, user?.id]);

  useEffect(() => {
    if (!token) {
      setOpeningId("");
      setExportingId("");
      setVersions([]);
      setLoadState("error");
      setError(t("Entre na conta para consultar o histórico.", "Sign in to view version history."));
      return;
    }
    const controller = new AbortController();
    let current = true;
    setLoadState("loading");
    setOpeningId("");
    setExportingId("");
    setError("");
    setNotice("");
    void api.scoreVersions(token, score.id, controller.signal)
      .then(({ versions: loaded }) => {
        if (!current) return;
        setVersions(loaded);
        setSelectedId((selected) => loaded.some((version) => version.id === selected)
          ? selected
          : loaded.find((version) => version.isCurrent)?.id ?? loaded[0]?.id ?? "");
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (!current || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : t("Não foi possível carregar o histórico.", "Couldn't load version history."));
        setLoadState("error");
      });
    return () => {
      current = false;
      controller.abort();
      requestSequence.current += 1;
      exportSequence.current += 1;
      openControllerRef.current?.abort();
      exportControllerRef.current?.abort();
    };
  }, [score.id, score.reviewRevision, score.updatedAt, retry, token, user?.id, t]);

  async function openVersion(version: ScoreVersion) {
    if (!token || !version.available || !onOpenVersion || openingId) return;
    setSelectedId(version.id);
    selectedIdRef.current = version.id;
    const sequence = ++requestSequence.current;
    const requestToken = token;
    const requestUserId = user?.id ?? null;
    const requestScoreId = score.id;
    const identity = `${score.id}:${score.updatedAt}:${score.reviewRevision ?? ""}`;
    const controller = new AbortController();
    openControllerRef.current?.abort();
    openControllerRef.current = controller;
    const isCurrent = () => sequence === requestSequence.current
      && tokenRef.current === requestToken
      && userIdRef.current === requestUserId
      && identity === `${scoreRef.current.id}:${scoreRef.current.updatedAt}:${scoreRef.current.reviewRevision ?? ""}`;
    setOpeningId(version.id);
    setError("");
    setNotice("");
    try {
      const musicXml = await api.scoreVersionMusicXml(requestToken, requestScoreId, version.id, controller.signal);
      if (!isCurrent() || controller.signal.aborted || version.id !== selectedIdRef.current) return;
      await onOpenVersion(version, musicXml);
      if (isCurrent()) {
        setNotice(t("Aberta: {{label}}. A versão atual não foi alterada.", "Opened: {{label}}. The current version was not changed.", { label: version.label }));
      }
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof ApiError && caught.status === 410) {
        setVersions((current) => current.map((item) => item.id === version.id ? { ...item, available: false } : item));
        setError(t("Esta versão não está mais disponível.", "This version is no longer available."));
      } else {
        setError(caught instanceof Error ? caught.message : t("Não foi possível abrir esta versão.", "Couldn't open this version."));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setOpeningId("");
        if (openControllerRef.current === controller) openControllerRef.current = null;
      }
    }
  }

  async function exportVersion(version: ScoreVersion) {
    if (!token || !version.available || exportingId) return;
    const sequence = ++exportSequence.current;
    const scoreId = score.id;
    const requestToken = token;
    const requestUserId = user?.id ?? null;
    const identity = `${score.id}:${score.updatedAt}:${score.reviewRevision ?? ""}`;
    const controller = new AbortController();
    exportControllerRef.current?.abort();
    exportControllerRef.current = controller;
    const isCurrent = () => sequence === exportSequence.current
      && tokenRef.current === requestToken
      && userIdRef.current === requestUserId
      && identity === `${scoreRef.current.id}:${scoreRef.current.updatedAt}:${scoreRef.current.reviewRevision ?? ""}`;
    setExportingId(version.id);
    setError("");
    setNotice("");
    try {
      const file = await api.downloadScoreVersionMusicXml(requestToken, scoreId, version.id, versionFilename(score.originalFilename, version), controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      if (!(await Sharing.isAvailableAsync())) {
        if (isCurrent()) setError(t("O compartilhamento de arquivos não está disponível neste aparelho.", "File sharing is not available on this device."));
        return;
      }
      if (!isCurrent() || controller.signal.aborted) return;
      await Sharing.shareAsync(file.uri, {
        dialogTitle: t("Exportar {{label}}", "Export {{label}}", { label: version.label }),
        mimeType: "application/vnd.recordare.musicxml+xml",
        UTI: "com.recordare.musicxml"
      });
      if (isCurrent()) {
        setNotice(t("Arquivo exportado: {{label}}.", "Exported: {{label}}.", { label: version.label }));
      }
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof ApiError && caught.status === 410) {
        setVersions((current) => current.map((item) => item.id === version.id ? { ...item, available: false } : item));
        setError(t("Esta versão não está mais disponível.", "This version is no longer available."));
      } else {
        setError(caught instanceof Error ? caught.message : t("Não foi possível exportar esta versão.", "Couldn't export this version."));
      }
    } finally {
      if (sequence === exportSequence.current) {
        setExportingId("");
        if (exportControllerRef.current === controller) exportControllerRef.current = null;
      }
    }
  }

  return (
    <View accessibilityLabel={t("Histórico de versões", "Version history")} style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{t("Histórico de versões", "Version history")}</Text>
          <Text style={styles.description}>{t("Abra uma versão para compará-la no leitor. Isso não altera a versão atual.", "Open a version to compare it in the score reader. This does not change the current version.")}</Text>
        </View>
        {loadState === "ready" ? <Text style={styles.count}>{t("{{count}} versões", "{{count}} versions", { count: versions.length })}</Text> : null}
      </View>

      {loadState === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.message}>{t("Carregando versões…", "Loading versions…")}</Text> : null}
      {loadState === "error" ? (
        <View style={styles.messageRow}>
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>
          {token ? <HistoryButton title={t("Tentar novamente", "Try again")} icon="refresh-outline" onPress={() => setRetry((value) => value + 1)} /> : null}
        </View>
      ) : null}
      {loadState === "ready" && versions.length === 0 ? <Text style={styles.message}>{t("Ainda não há versões salvas.", "No saved versions yet.")}</Text> : null}
      {loadState === "ready" && versions.length ? (
        <View accessibilityLabel={t("Versões disponíveis", "Available versions")} style={styles.list}>
          {versions.map((version) => {
            const selectedRow = selectedId === version.id;
            return (
              <View key={version.id} style={[styles.row, selectedRow && styles.rowSelected]}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedRow }} onPress={() => setSelectedId(version.id)} style={styles.details}>
                  <Text style={styles.versionLabel}>{version.label}{version.isCurrent ? <Text style={styles.current}>{` · ${t("Atual", "Current")}`}</Text> : null}</Text>
                  <Text style={styles.meta}>{formatDate(version.createdAt, language)} · {statusLabel(version.status, language)} · {version.kind === "correction" ? t("correção", "correction") : t("conversão", "conversion")}</Text>
                  {version.coverage ? <Text style={styles.coverage}>{t("{{processed}} de {{total}} páginas", "{{processed}} of {{total}} pages", { processed: version.coverage.processedPages, total: version.coverage.totalPages })}{version.coverage.missingPages.length ? ` · ${t("{{count}} ausentes", "{{count}} missing", { count: version.coverage.missingPages.length })}` : ""}</Text> : null}
                  {!version.available ? <Text style={styles.unavailable}>{t("Arquivo indisponível", "File unavailable")}</Text> : null}
                </Pressable>
                <View style={styles.actions}>
                  <HistoryButton
                    title={openingId === version.id ? t("Abrindo…", "Opening…") : t("Abrir", "Open")}
                    icon="open-outline"
                    disabled={!version.available || !onOpenVersion || Boolean(openingId)}
                    onPress={() => void openVersion(version)}
                  />
                  <HistoryButton
                    title={exportingId === version.id ? t("Exportando…", "Exporting…") : t("Exportar", "Export")}
                    icon="download-outline"
                    disabled={!version.available || Boolean(exportingId)}
                    onPress={() => void exportVersion(version)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.message}>{notice}</Text> : null}
      {error && loadState === "ready" ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function HistoryButton({ title, icon, disabled, onPress }: { title: string; icon: React.ComponentProps<typeof Ionicons>["name"]; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabledButton, pressed && styles.pressed]}>
      <Ionicons color={colors.ink} name={icon} size={17} />
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function statusLabel(status: ScoreVersion["status"], language: "pt" | "en") {
  const labels: Record<ScoreVersion["status"], [string, string]> = {
    complete: ["completa", "complete"], partial: ["parcial", "partial"], needs_review: ["precisa de revisão", "needs review"], approved: ["disponível", "available"], unverified: ["não verificada", "unverified"]
  };
  return labels[status][language === "en" ? 1 : 0];
}

function formatDate(value: string, language: "pt" | "en") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function versionFilename(filename: string, version: ScoreVersion) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "score";
  return `${base}-${version.kind}-${version.id.replace(/[^a-zA-Z0-9]/g, "-").slice(-12)}.musicxml`;
}

const styles = StyleSheet.create({
  container: { alignSelf: "stretch", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 12, minWidth: 0, padding: 14, width: "100%" },
  heading: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  headingCopy: { flex: 1, gap: 4, minWidth: 210 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 26 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  count: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  list: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  row: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, minWidth: 0, paddingVertical: 10 },
  rowSelected: { backgroundColor: colors.surfaceSoft },
  details: { gap: 3, minHeight: 44, justifyContent: "center", minWidth: 0 },
  versionLabel: { color: colors.ink, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  current: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  coverage: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  unavailable: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 7 },
  button: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.lineStrong, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 11 },
  buttonText: { color: colors.ink, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  disabledButton: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
  message: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  messageRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { color: colors.danger, flex: 1, fontSize: 13, lineHeight: 19 },
});
