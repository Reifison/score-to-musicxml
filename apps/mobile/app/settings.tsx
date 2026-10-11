import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../src/components/BottomNav";
import { colors, sharedStyles } from "../src/theme/styles";

const supportAddress = "reifison@hotmail.com";

export default function SettingsScreen() {
  const { logout, user } = useAuth();

  async function openLink(url: string, title: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(title, `Não foi possível abrir este link. Você pode acessar: ${url}`);
    }
  }

  async function openSupport() {
    const subject = encodeURIComponent("Ajuda com o Conversor de Partituras");
    const body = encodeURIComponent(`Olá,\n\nMinha conta no app: ${user?.email ?? ""}\n\nDescreva o que aconteceu:\n`);
    await openLink(`mailto:${supportAddress}?subject=${subject}&body=${body}`, "Suporte");
  }

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  return (
    <View style={sharedStyles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <Text style={sharedStyles.title}>Configurações</Text>
          <Text style={sharedStyles.subtitle}>Preferências, ajuda e informações do aplicativo.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aparência</Text>
          <View style={styles.settingRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="sunny-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Tema claro</Text>
              <Text style={styles.rowDescription}>O app segue a identidade visual clara do Conversor de Partituras.</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Partituras e reprodução</Text>
          <View style={styles.settingRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="wifi-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Player conectado</Text>
              <Text style={styles.rowDescription}>O player visual precisa de internet para abrir e reproduzir uma partitura. O MusicXML em cache, sozinho, não mantém o player disponível offline.</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/profile")} style={styles.actionRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="person-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Perfil e senha</Text>
              <Text style={styles.rowDescription}>Revise seus dados e altere a senha da conta.</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ajuda e créditos</Text>
          <Pressable accessibilityHint={`Abre um e-mail para ${supportAddress}`} accessibilityRole="button" onPress={openSupport} style={styles.actionRow}>
            <View style={styles.iconBox}><Ionicons color={colors.primaryDark} name="mail-outline" size={21} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Falar com o suporte</Text>
              <Text style={styles.rowDescription}>{supportAddress}</Text>
            </View>
            <Ionicons color={colors.muted} name="open-outline" size={18} />
          </Pressable>
          <View style={styles.credits}>
            <Text style={styles.rowTitle}>Créditos dos timbres</Text>
            <Text style={styles.rowDescription}>Piano: Salamander Grand Piano V3, por Alexander Holm, sob CC BY 3.0.</Text>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://creativecommons.org/licenses/by/3.0/", "Licença do piano")} style={styles.creditLink}>
              <Text style={styles.linkText}>Ver licença e fonte do piano</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://github.com/sfzinstruments/SalamanderGrandPiano", "Fonte do piano")} style={styles.creditLink}>
              <Text style={styles.linkText}>Abrir repositório Salamander</Text>
            </Pressable>
            <Text style={styles.rowDescription}>Violão: Shinyguitar, por Karoryfer Lecolds, sob CC0 1.0.</Text>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://creativecommons.org/publicdomain/zero/1.0/", "Licença do violão")} style={styles.creditLink}>
              <Text style={styles.linkText}>Ver licença e fonte do violão</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLink("https://github.com/sfzinstruments/karoryfer.shinyguitar", "Fonte do violão")} style={styles.creditLink}>
              <Text style={styles.linkText}>Abrir repositório Shinyguitar</Text>
            </Pressable>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.signOut]}>
          <Ionicons color={colors.ink} name="log-out-outline" size={20} />
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
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
    paddingBottom: bottomNavHeight + 32,
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
