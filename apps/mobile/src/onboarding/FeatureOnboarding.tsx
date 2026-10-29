import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { AdaptiveScreen } from "../components/AdaptiveScreen";
import { useTranslation } from "../i18n";
import { colors, screenGutter } from "../theme/styles";

type FeatureStep = 0 | 1 | 2 | 3;
type FinishReason = "completed" | "skipped";
type Translate = ReturnType<typeof useTranslation>["t"];

const LAST_STEP = 3;
const WIDE_CONTENT_WIDTH = 760;

export function FeatureOnboarding({ onFinish }: { onFinish: (reason: FinishReason) => void }) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState<FeatureStep>(0);
  const [contentWidth, setContentWidth] = useState(0);
  const currentStep = useRef<FeatureStep>(stepIndex);
  const finishRef = useRef(onFinish);
  currentStep.current = stepIndex;
  finishRef.current = onFinish;
  const wide = contentWidth >= WIDE_CONTENT_WIDTH;

  const steps = [
    {
      title: t("Da folha ao MusicXML", "From page to MusicXML"),
      description: t(
        "Envie um PDF, uma foto ou digitalize várias páginas no scanner de documentos. Antes de enviar, escolha o tipo da partitura.",
        "Upload a PDF or photo, or scan multiple pages with the document scanner. Choose the score type before sending."
      )
    },
    {
      title: t("Compare original e resultado", "Compare the original and result"),
      description: t(
        "Compare a partitura convertida com o original. Quando houver sugestões de notas ou pausas, localize o trecho para aceitar, recusar ou desfazer.",
        "Compare the converted score with the original. When note or rest suggestions are available, locate the passage to accept, reject, or undo."
      )
    },
    {
      title: t("Consulte versões anteriores", "View previous versions"),
      description: t(
        "Abra ou exporte uma versão anterior para consultá-la depois. Isso não substitui a versão atual.",
        "Open or export an earlier version for later reference. The current version stays as it is."
      )
    },
    {
      title: t("Ouça e repita um trecho", "Listen and repeat a passage"),
      description: t(
        "Ajuste o andamento e repita um trecho entre o compasso inicial e o final. O player precisa de internet para carregar.",
        "Adjust the tempo and repeat a passage between its start and end measures. The player needs an internet connection to load."
      )
    }
  ] as const;
  const step = steps[stepIndex];
  const announcement = t("Etapa {{current}} de 4. {{title}}", "Step {{current}} of 4. {{title}}", {
    current: stepIndex + 1,
    title: step.title
  });

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (currentStep.current === 0) {
        finishRef.current("skipped");
        return true;
      }
      setStepIndex((current) => Math.max(0, current - 1) as FeatureStep);
      return true;
    });
    return () => subscription.remove();
  }, []);

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1) as FeatureStep);
  }

  function continueOnboarding() {
    if (stepIndex === LAST_STEP) {
      onFinish("completed");
      return;
    }
    setStepIndex((current) => Math.min(LAST_STEP, current + 1) as FeatureStep);
  }

  return (
    <AdaptiveScreen navigation={false}>
      <View style={styles.screen} testID="feature-onboarding">
        <View style={styles.topBar}>
          <View style={styles.progressGroup}>
            <Text accessibilityLiveRegion="polite" style={styles.stepCount}>{t("Etapa {{current}} de 4", "Step {{current}} of 4", { current: stepIndex + 1 })}</Text>
            <View
              accessible
              accessibilityLabel={announcement}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 1, max: 4, now: stepIndex + 1, text: t("Etapa {{current}} de 4", "Step {{current}} of 4", { current: stepIndex + 1 }) }}
              style={styles.progressTrack}
            >
              <View style={[styles.progressFill, { width: `${((stepIndex + 1) / 4) * 100}%` }]} />
            </View>
          </View>
          <Pressable
            accessibilityLabel={t("Pular apresentação", "Skip introduction")}
            accessibilityRole="button"
            onPress={() => onFinish("skipped")}
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>{t("Pular", "Skip")}</Text>
          </Pressable>
        </View>

        <View
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setContentWidth((current) => Math.abs(current - width) > 0.5 ? width : current);
          }}
          style={styles.contentStage}
          testID="feature-onboarding-content"
        >
          <ScrollView
            key={stepIndex}
            contentContainerStyle={[styles.scrollContent, wide && styles.scrollContentWide]}
            showsVerticalScrollIndicator
            style={styles.scroll}
            testID="feature-onboarding-scroll"
          >
            <View style={[styles.story, wide && styles.storyWide]} testID="feature-onboarding-story">
              <View style={[styles.copyColumn, wide && styles.copyColumnWide]}>
                <View style={styles.titleRow}>
                  <Text accessibilityRole="header" style={styles.title}>{step.title}</Text>
                  {stepIndex > 0 ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>{t("Novo", "New")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.description}>{step.description}</Text>
              </View>
              <View style={[styles.illustrationColumn, wide && styles.illustrationColumnWide]}>
                <StepIllustration step={stepIndex} t={t} />
              </View>
            </View>

            {stepIndex === 0 ? <ScoreTypeList t={t} /> : null}
          </ScrollView>
        </View>

        <View style={styles.footer} testID="feature-onboarding-actions">
          <Pressable
            accessibilityLabel={t("Voltar", "Back")}
            accessibilityRole="button"
            accessibilityState={{ disabled: stepIndex === 0 }}
            disabled={stepIndex === 0}
            onPress={goBack}
            style={[styles.backButton, stepIndex === 0 && styles.backButtonDisabled]}
          >
            <Ionicons accessible={false} color={stepIndex === 0 ? colors.muted : colors.ink} name="chevron-back-outline" size={20} />
            <Text style={styles.backText}>{t("Voltar", "Back")}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={stepIndex === LAST_STEP ? t("Começar", "Get started") : t("Continuar", "Continue")}
            accessibilityRole="button"
            onPress={continueOnboarding}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryText}>{stepIndex === LAST_STEP ? t("Começar", "Get started") : t("Continuar", "Continue")}</Text>
            <Ionicons accessible={false} color={colors.onPrimary} name={stepIndex === LAST_STEP ? "checkmark" : "arrow-forward"} size={20} />
          </Pressable>
        </View>
      </View>
    </AdaptiveScreen>
  );
}

function StepIllustration({ step, t }: { step: FeatureStep; t: Translate }) {
  if (step === 0) return <InputFlowDiagram t={t} />;
  if (step === 1) return <ReviewDiagram t={t} />;
  if (step === 2) return <VersionDiagram t={t} />;
  return <PracticeDiagram t={t} />;
}

function InputFlowDiagram({ t }: { t: Translate }) {
  return (
    <View accessible accessibilityLabel={t("Diagrama simplificado: PDF, foto ou várias páginas escaneadas viram um arquivo MusicXML.", "Simplified diagram: a PDF, photo, or multiple scanned pages become a MusicXML file.")} accessibilityRole="image" style={styles.diagramSurface}>
      <View style={styles.inputFlow}>
        <View style={styles.sourceList}>
          <SourceItem icon="document-text-outline" label={t("PDF", "PDF")} />
          <SourceItem icon="image-outline" label={t("Foto", "Photo")} />
          <SourceItem icon="scan-outline" label={t("Scanner · várias páginas", "Scanner · multiple pages")} />
        </View>
        <Ionicons accessible={false} color={colors.primaryDark} name="arrow-forward" size={23} />
        <View style={styles.outputFile}>
          <View style={styles.outputIcon}>
            <Ionicons accessible={false} color={colors.onPrimary} name="musical-notes-outline" size={30} />
          </View>
          <Text style={styles.outputLabel}>MusicXML</Text>
        </View>
      </View>
      <Text style={styles.diagramCaption}>{t("Representação simplificada do fluxo", "Simplified workflow diagram")}</Text>
    </View>
  );
}

function SourceItem({ icon, label }: { icon: "document-text-outline" | "image-outline" | "scan-outline"; label: string }) {
  return (
    <View style={styles.sourceItem}>
      <View style={styles.sourceIcon}>
        <Ionicons accessible={false} color={colors.primaryDark} name={icon} size={20} />
      </View>
      <Text style={styles.sourceLabel}>{label}</Text>
    </View>
  );
}

function ScoreTypeList({ t }: { t: Translate }) {
  const types = [
    t("Melodia", "Melody"),
    t("Piano", "Piano"),
    t("Violão solo", "Solo guitar"),
    t("Violão duo", "Guitar duet")
  ];

  return (
    <View style={styles.typeGroup}>
      <Text style={styles.typeHeading}>{t("Tipos disponíveis", "Available score types")}</Text>
      <View style={styles.typeList}>
        {types.map((type) => (
          <View key={type} style={styles.typeTag}>
            <Text style={styles.typeTagText}>{type}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewDiagram({ t }: { t: Translate }) {
  return (
    <View accessible accessibilityLabel={t("Diagrama ilustrativo: original e resultado lado a lado; localizar, aceitar, recusar ou desfazer sugestões existentes.", "Illustrative diagram: original and result side by side; locate, accept, reject, or undo existing suggestions.")} accessibilityRole="image" style={styles.diagramSurface}>
      <View style={styles.reviewColumns}>
        <View style={styles.reviewPreview}>
          <Text style={styles.previewHeading}>{t("Original", "Original")}</Text>
          <StaffDiagram highlighted={false} />
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewPreview}>
          <Text style={styles.previewHeading}>{t("Resultado", "Result")}</Text>
          <StaffDiagram highlighted />
        </View>
      </View>
      <View style={styles.actionLegend}>
        <ActionLegendItem icon="locate-outline" label={t("Localizar", "Locate")} />
        <ActionLegendItem icon="checkmark-circle-outline" label={t("Aceitar", "Accept")} />
        <ActionLegendItem icon="close-circle-outline" label={t("Recusar", "Reject")} />
        <ActionLegendItem icon="arrow-undo-outline" label={t("Desfazer", "Undo")} />
      </View>
    </View>
  );
}

function StaffDiagram({ highlighted }: { highlighted: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.staffSurface}>
      <View style={styles.staffLines}>
        {[0, 1, 2, 3, 4].map((line) => <View key={line} style={[styles.staffLine, { top: 6 + line * 7 }]} />)}
        {[13, 31, 48, 68, 84].map((left, noteIndex) => (
          <View key={left} style={[styles.noteHead, { left: `${left}%`, top: noteIndex % 2 === 0 ? 16 : 23 }, highlighted && noteIndex === 2 && styles.noteHeadHighlighted]} />
        ))}
      </View>
    </View>
  );
}

function ActionLegendItem({ icon, label }: { icon: "locate-outline" | "checkmark-circle-outline" | "close-circle-outline" | "arrow-undo-outline"; label: string }) {
  return (
    <View style={styles.actionLegendItem}>
      <Ionicons accessible={false} color={colors.primaryDark} name={icon} size={17} />
      <Text style={styles.actionLegendText}>{label}</Text>
    </View>
  );
}

function VersionDiagram({ t }: { t: Translate }) {
  return (
    <View accessible accessibilityLabel={t("Diagrama ilustrativo de versões atual e anterior, com opções para abrir e exportar.", "Illustrative diagram of current and previous versions, with options to open and export.")} accessibilityRole="image" style={styles.diagramSurface}>
      <View style={[styles.versionRow, styles.currentVersionRow]}>
        <Ionicons accessible={false} color={colors.primaryDark} name="document-text-outline" size={23} />
        <View style={styles.versionCopy}>
          <Text style={styles.versionTitle}>{t("Versão atual", "Current version")}</Text>
          <Text style={styles.versionState}>{t("Mantida no histórico", "Kept in history")}</Text>
        </View>
        <Ionicons accessible={false} color={colors.primaryDark} name="checkmark-circle-outline" size={21} />
      </View>
      <View style={styles.versionRow}>
        <Ionicons accessible={false} color={colors.muted} name="documents-outline" size={23} />
        <View style={styles.versionCopy}>
          <Text style={styles.versionTitle}>{t("Versão anterior", "Previous version")}</Text>
          <Text style={styles.versionState}>{t("Consultar · Exportar", "Open · Export")}</Text>
        </View>
        <View style={styles.versionActions}>
          <Ionicons accessible={false} color={colors.ink} name="open-outline" size={19} />
          <Ionicons accessible={false} color={colors.ink} name="download-outline" size={19} />
        </View>
      </View>
    </View>
  );
}

function PracticeDiagram({ t }: { t: Translate }) {
  return (
    <View accessible accessibilityLabel={t("Diagrama ilustrativo do player com andamento, repetição entre compassos e indicação de internet necessária.", "Illustrative player diagram with tempo, measure repeat, and an internet requirement.")} accessibilityRole="image" style={styles.diagramSurface}>
      <View style={styles.playerRow}>
        <View style={styles.playIcon}>
          <Ionicons accessible={false} color={colors.onPrimary} name="play" size={22} />
        </View>
        <View style={styles.sliderDiagram}>
          <View style={styles.sliderTrack}>
            <View style={styles.sliderProgress} />
            <View style={styles.sliderThumb} />
          </View>
          <Text style={styles.tempoLabel}>{t("Andamento", "Tempo")}</Text>
        </View>
        <Ionicons accessible={false} color={colors.primaryDark} name="repeat-outline" size={23} />
      </View>
      <View style={styles.measurePair}>
        <MeasureMark label={t("Compasso inicial", "Start measure")} />
        <View style={styles.measureConnector} />
        <MeasureMark label={t("Compasso final", "End measure")} />
      </View>
      <View style={styles.internetNote}>
        <Ionicons accessible={false} color={colors.primaryDark} name="wifi-outline" size={19} />
        <Text style={styles.internetText}>{t("Player conectado à internet", "Player uses an internet connection")}</Text>
      </View>
    </View>
  );
}

function MeasureMark({ label }: { label: string }) {
  return (
    <View style={styles.measureMark}>
      <View style={styles.measureBars}>
        <View style={styles.measureBar} />
        <View style={styles.measureBar} />
        <View style={styles.measureBar} />
      </View>
      <Text style={styles.measureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1, minHeight: 0, minWidth: 0 },
  topBar: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: screenGutter,
    paddingVertical: 8
  },
  progressGroup: { flex: 1, gap: 6, minWidth: 0 },
  stepCount: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  progressTrack: { alignSelf: "stretch", backgroundColor: colors.line, borderRadius: 3, height: 5, maxWidth: 240, overflow: "hidden" },
  progressFill: { backgroundColor: colors.primary, borderRadius: 3, height: "100%" },
  skipButton: { alignItems: "center", borderRadius: 12, justifyContent: "center", minHeight: 48, minWidth: 64, paddingHorizontal: 8 },
  skipText: { color: colors.primaryDark, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  contentStage: { flex: 1, minHeight: 0, minWidth: 0 },
  scroll: { flex: 1 },
  scrollContent: { alignSelf: "center", flexGrow: 1, gap: 24, maxWidth: 1200, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 24, width: "100%" },
  scrollContentWide: { gap: 30, paddingHorizontal: 36, paddingVertical: 36 },
  story: { flexDirection: "column", gap: 22, width: "100%" },
  storyWide: { alignItems: "center", flexDirection: "row", gap: 40 },
  copyColumn: { gap: 14, minWidth: 0 },
  copyColumnWide: { flex: 5 },
  illustrationColumn: { minWidth: 0, width: "100%" },
  illustrationColumnWide: { flex: 5 },
  titleRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 9 },
  title: { color: colors.ink, flexShrink: 1, fontSize: 30, fontWeight: "800", lineHeight: 37 },
  newBadge: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, justifyContent: "center", minHeight: 30, paddingHorizontal: 11, paddingVertical: 4 },
  newBadgeText: { color: colors.primaryDark, fontSize: 13, fontWeight: "800", lineHeight: 19 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 24, maxWidth: 560 },
  diagramSurface: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 17, minWidth: 0, padding: 18, width: "100%" },
  inputFlow: { alignItems: "center", flexDirection: "row", gap: 12, minWidth: 0 },
  sourceList: { flex: 1, gap: 8, minWidth: 0 },
  sourceItem: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 40, minWidth: 0 },
  sourceIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 10, flexShrink: 0, height: 36, justifyContent: "center", width: 36 },
  sourceLabel: { color: colors.ink, flexShrink: 1, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  outputFile: { alignItems: "center", gap: 8, minWidth: 76 },
  outputIcon: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 17, height: 58, justifyContent: "center", width: 58 },
  outputLabel: { color: colors.ink, fontSize: 14, fontWeight: "800", lineHeight: 19, textAlign: "center" },
  diagramCaption: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "right" },
  typeGroup: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 12, paddingTop: 17 },
  typeHeading: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  typeList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeTag: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, justifyContent: "center", minHeight: 44, paddingHorizontal: 13, paddingVertical: 9 },
  typeTagText: { color: colors.primaryDark, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  reviewColumns: { alignItems: "stretch", flexDirection: "row", minWidth: 0 },
  reviewPreview: { flex: 1, gap: 9, minWidth: 0, paddingHorizontal: 8, paddingVertical: 4 },
  reviewDivider: { alignSelf: "stretch", backgroundColor: colors.line, width: StyleSheet.hairlineWidth },
  previewHeading: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 21 },
  staffSurface: { backgroundColor: colors.surfaceSoft, borderRadius: 9, height: 58, justifyContent: "center", overflow: "hidden", paddingHorizontal: 8 },
  staffLines: { height: 41, position: "relative", width: "100%" },
  staffLine: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, left: 0, position: "absolute", right: 0 },
  noteHead: { backgroundColor: colors.ink, borderRadius: 5, height: 7, position: "absolute", transform: [{ rotate: "-20deg" }], width: 10 },
  noteHeadHighlighted: { backgroundColor: colors.primary },
  actionLegend: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexWrap: "wrap", gap: 13, paddingTop: 13 },
  actionLegendItem: { alignItems: "center", flexDirection: "row", gap: 5, minHeight: 28 },
  actionLegendText: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  versionRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, minHeight: 74, paddingHorizontal: 10, paddingVertical: 12 },
  currentVersionRow: { backgroundColor: colors.primarySoft, borderBottomWidth: 0, borderRadius: 12 },
  versionCopy: { flex: 1, gap: 3, minWidth: 0 },
  versionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 21 },
  versionState: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  versionActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  playerRow: { alignItems: "center", flexDirection: "row", gap: 13 },
  playIcon: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, height: 48, justifyContent: "center", width: 48 },
  sliderDiagram: { flex: 1, gap: 10, minWidth: 0 },
  sliderTrack: { backgroundColor: colors.line, borderRadius: 4, height: 6, justifyContent: "center", position: "relative", width: "100%" },
  sliderProgress: { backgroundColor: colors.primary, borderRadius: 4, height: 6, width: "38%" },
  sliderThumb: { backgroundColor: colors.panel, borderColor: colors.primaryDark, borderRadius: 9, borderWidth: 1, height: 18, left: "34%", position: "absolute", top: -6, width: 18 },
  tempoLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  measurePair: { alignItems: "center", flexDirection: "row", gap: 8 },
  measureMark: { alignItems: "center", borderColor: colors.lineStrong, borderRadius: 10, borderWidth: 1, flex: 1, gap: 8, justifyContent: "center", minHeight: 72, minWidth: 0, padding: 8 },
  measureBars: { alignItems: "stretch", flexDirection: "row", gap: 14, height: 19 },
  measureBar: { backgroundColor: colors.primary, height: 19, width: 2 },
  measureLabel: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  measureConnector: { backgroundColor: colors.primary, borderRadius: 2, height: 2, width: 18 },
  internetNote: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, paddingTop: 13 },
  internetText: { color: colors.primaryDark, flexShrink: 1, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  footer: { alignItems: "center", backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, justifyContent: "space-between", paddingBottom: 12, paddingHorizontal: screenGutter, paddingTop: 12 },
  backButton: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.lineStrong, borderRadius: 14, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 52, paddingHorizontal: 10, paddingVertical: 10 },
  backButtonDisabled: { opacity: 0.58 },
  backText: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, flex: 1, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 52, paddingHorizontal: 12, paddingVertical: 10 },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800", lineHeight: 21 }
});
