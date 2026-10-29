import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../src/adaptive/AdaptiveTypography";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { useTranslation } from "../src/i18n";
import { useOnboarding } from "../src/onboarding/OnboardingProvider";
import { colors, sharedStyles } from "../src/theme/styles";

const supportAddress = "reifison@hotmail.com";

export default function SettingsScreen() {
  const { logout, user } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const { openGuide } = useOnboarding();

  async function openLink(url: string, title: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(title, t("Não foi possível abrir este link. Você pode acessar: {url}", "This link could not be opened. You can visit: {url}", { url }));
    }
  }

  async function openSupport() {
    const subject = encodeURIComponent(t("Ajuda com o Conversor de Partituras", "Help with Sheet Music Converter"));
    const body = encodeURIComponent(t("Olá,\n\nMinha conta no app: {email}\n\nDescreva o que aconteceu:\n", "Hello,\n\nMy app account: {email}\n\nPlease describe what happened:\n", { email: user?.email ?? "" }));
    await openLink(`mailto:${supportAddress}?subject=${subject}&body=${body}`, t("Suporte", "Support"));
  }

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  async function chooseLanguage(nextLanguage: "pt" | "en") {
    try {
      await setLanguage(nextLanguage);
    } catch {
      Alert.alert(t("Idioma alterado, mas não foi possível salvar a preferência neste dispositivo.", "Language changed, but the preference could not be saved on this device."));
    }
  }

  return (
    <AdaptiveScreen title={t("Configurações", "Settings")} back>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <Text style={sharedStyles.subtitle}>{t("Preferências, ajuda e informações do aplicativo.", "Preferences, help, and app information.")}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Idioma", "Language")}</Text>
          <Text style={styles.rowDescription}>{t("Escolha o idioma do aplicativo.", "Choose the app language.")}</Text>
          <View style={styles.languageChoices}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: language === "pt" }}
              onPress={() => void chooseLanguage("pt")}
              style={[styles.languageChoice, language === "pt" && styles.languageChoiceSelected]}
            >
              <Text style={styles.languageChoiceText}>Português</Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: language === "en" }}
              onPress={() => void chooseLanguage("en")}
              style={[styles.languageChoice, language === "en" && styles.languageChoiceSelected]}
            >
              <Text style={styles.languageChoiceText}>English</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Aparência", "Appearance")}</Text>
          <View style={styles.settingRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="sunny-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t("Tema claro", "Light theme")}</Text>
              <Text style={styles.rowDescription}>{t("O app segue a identidade visual clara do Conversor de Partituras.", "The app uses the light appearance of Sheet Music Converter.")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Partituras e reprodução", "Scores and playback")}</Text>
          <View style={styles.settingRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="wifi-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t("Player conectado", "Connected player")}</Text>
              <Text style={styles.rowDescription}>{t("O player visual precisa de internet para abrir e reproduzir uma partitura. O MusicXML em cache, sozinho, não mantém o player disponível offline.", "The visual player needs an internet connection to open and play a score. A cached MusicXML file alone does not make the player available offline.")}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/scores?paywall=1")} style={styles.actionRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="infinite-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t("Conversões ilimitadas", "Unlimited conversions")}</Text>
              <Text style={styles.rowDescription}>{t("Veja a opção para liberar conversões sem limite nesta conta.", "See the option to unlock unlimited conversions for this account.")}</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={18} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/profile")} style={styles.actionRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="person-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t("Perfil e senha", "Profile and password")}</Text>
              <Text style={styles.rowDescription}>{t("Revise seus dados e altere a senha da conta.", "Review your details and change your account password.")}</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Ajuda e créditos", "Help and credits")}</Text>
          <Pressable accessibilityRole="button" onPress={openGuide} style={styles.actionRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="sparkles-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t("Conhecer o app", "Explore the app")}</Text>
              <Text style={styles.rowDescription}>{t("Reveja como digitalizar, conferir, consultar versões e estudar por compassos.", "See how to scan, review, browse versions, and practice by measure.")}</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={18} />
          </Pressable>
          <Pressable accessibilityHint={t("Abre um e-mail para {address}", "Opens an email to {address}", { address: supportAddress })} accessibilityRole="button" onPress={openSupport} style={styles.actionRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="mail-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t("Falar com o suporte", "Contact support")}</Text>
              <Text style={styles.rowDescription}>{supportAddress}</Text>
            </View>
            <Ionicons color={colors.muted} name="open-outline" size={18} />
          </Pressable>
          <View style={styles.credits}>
            <Text style={styles.rowTitle}>{t("Créditos dos timbres", "Sound credits")}</Text>
            <Text style={styles.rowDescription}>{t("Piano: Salamander Grand Piano V3, por Alexander Holm, sob CC BY 3.0.", "Piano: Salamander Grand Piano V3 by Alexander Holm, licensed under CC BY 3.0.")}</Text>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://creativecommons.org/licenses/by/3.0/", t("Licença do piano", "Piano license"))} style={styles.creditLink}>
              <Text style={styles.linkText}>{t("Ver licença e fonte do piano", "View piano license and source")}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://github.com/sfzinstruments/SalamanderGrandPiano", t("Fonte do piano", "Piano source"))} style={styles.creditLink}>
              <Text style={styles.linkText}>{t("Abrir repositório Salamander", "Open Salamander repository")}</Text>
            </Pressable>
            <Text style={styles.rowDescription}>{t("Violão: Shinyguitar, por Karoryfer Lecolds, sob CC0 1.0.", "Guitar: Shinyguitar by Karoryfer Lecolds, licensed under CC0 1.0.")}</Text>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://creativecommons.org/publicdomain/zero/1.0/", t("Licença do violão", "Guitar license"))} style={styles.creditLink}>
              <Text style={styles.linkText}>{t("Ver licença e fonte do violão", "View guitar license and source")}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://github.com/sfzinstruments/karoryfer.shinyguitar", t("Fonte do violão", "Guitar source"))} style={styles.creditLink}>
              <Text style={styles.linkText}>{t("Abrir repositório Shinyguitar", "Open Shinyguitar repository")}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.signOut]}>
          <Ionicons color={colors.ink} name="log-out-outline" size={20} />
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{t("Sair da conta", "Sign out")}</Text>
        </Pressable>
      </ScrollView>
    </AdaptiveScreen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "flex-start",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  content: {
    alignSelf: "center",
    gap: 22,
    maxWidth: 680,
    padding: 20,
    paddingBottom: 24,
    width: "100%"
  },
  creditLink: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingRight: 8
  },
  credits: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 7,
    paddingTop: 14
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  linkText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "800",
    textDecorationLine: "underline",
    textDecorationColor: colors.primaryDark
  },
  languageChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  languageChoice: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: 14
  },
  languageChoiceSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryDark
  },
  languageChoiceText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  pageHeader: {
    gap: 6
  },
  rowCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  section: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  settingRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  signOut: {
    marginTop: 2
  }
});
