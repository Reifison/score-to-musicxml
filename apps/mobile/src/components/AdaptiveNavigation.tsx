import { t, useTranslation } from "../i18n";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text, AdaptiveTypographyProvider } from "../adaptive/AdaptiveTypography";
import type { ReaderLayout } from "../adaptive/readingLayout";
import { useAdaptiveLayout } from "../adaptive/useAdaptiveLayout";
import { useAuth } from "../auth/AuthProvider";
import { activeBottomNavKey, activeRailUtilityKey, bottomNavItemsForRole, railUtilityItems } from "../navigation/bottomNavModel";
import { colors } from "../theme/styles";

export function backToScores() {
  if (router.canGoBack()) router.back();
  else router.replace("/scores");
}

export function AdaptiveNavigation({ layout, back = false, onBack = backToScores, backLabel, readerDetails }: {
  layout: Pick<ReaderLayout, "navigationFrame" | "navigationMode"> & { fontScale: number };
  back?: boolean;
  onBack?: () => void;
  backLabel?: string;
  readerDetails?: { open: boolean; onToggle: () => void };
}) {
  useTranslation();
  const pathname = usePathname();
  const { user } = useAuth();
  const items = bottomNavItemsForRole(user?.role);
  const utilityItems = railUtilityItems();
  const activeKey = activeBottomNavKey(pathname);
  const activeUtilityKey = activeRailUtilityKey(pathname);
  const rail = layout.navigationMode === "rail";
  const frame = layout.navigationFrame;

  return (
    <View style={[styles.navigation, { left: frame.x, top: frame.y, width: frame.width, height: frame.height }]}>
      <ScrollView
        contentContainerStyle={[styles.items, !rail && styles.bottomItems]}
        horizontal={!rail}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={rail}
      >
        {rail && (back ? (
          <Pressable accessibilityLabel={backLabel ?? t("Voltar", "Back")} accessibilityRole="button" onPress={onBack} style={styles.item}>
            <Ionicons color={colors.ink} name="chevron-back" size={24} />
            <Text style={styles.label}>{t("Voltar", "Back")}</Text>
          </Pressable>
        ) : null)}
        {items.map((item) => {
          const active = activeKey === item.key;
          return (
            <Pressable
              accessibilityLabel={t(item.label, ({ home: "Home", scores: "Scores", profile: "Profile", users: "Users", logs: "Logs" })[item.key])}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.key}
              onPress={() => {
                if (pathname === item.href) return;
                if (item.key === "home") router.replace(item.href);
                else router.navigate(item.href);
              }}
              style={[styles.item, !rail && { minWidth: Math.ceil(68 * Math.max(1, layout.fontScale)), flex: 1 }, active && styles.selected]}
            >
              <Ionicons color={active ? colors.primaryDark : colors.muted} name={item.icon} size={23} />
              <Text style={[styles.label, active && styles.activeLabel]}>{t(item.label, ({ home: "Home", scores: "Scores", profile: "Profile", users: "Users", logs: "Logs" })[item.key])}</Text>
            </Pressable>
          );
        })}
        {rail && readerDetails ? (
          <Pressable
            accessibilityLabel={readerDetails.open ? t("Fechar detalhes da partitura", "Close score details") : t("Abrir detalhes da partitura", "Open score details")}
            accessibilityRole="button"
            accessibilityState={{ expanded: readerDetails.open }}
            onPress={readerDetails.onToggle}
            style={[styles.item, readerDetails.open && styles.selected]}
          >
            <Ionicons color={colors.primaryDark} name={readerDetails.open ? "close-outline" : "options-outline"} size={23} />
            <Text style={[styles.label, readerDetails.open && styles.activeLabel]}>{t("Detalhes", "Details")}</Text>
          </Pressable>
        ) : null}
        {rail && utilityItems.map((item) => {
          const active = activeUtilityKey === item.key;
          return (
            <Pressable
              accessibilityLabel={t(item.label, item.englishLabel)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.key}
              onPress={() => {
                if (pathname === item.href) return;
                router.navigate(item.href);
              }}
              style={[styles.item, active && styles.selected]}
            >
              <Ionicons color={active ? colors.primaryDark : colors.muted} name={item.icon} size={23} />
              <Text style={[styles.label, active && styles.activeLabel]}>{t(item.label, item.englishLabel)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Compatibility for callers outside AdaptiveScreen. New screens reserve the
// navigation frame through their layout instead of padding by this constant.
export const bottomNavHeight = 80;
export function BottomNav() {
  const layout = useAdaptiveLayout();
  return <AdaptiveTypographyProvider fontScale={layout.fontScale}><AdaptiveNavigation layout={layout} /></AdaptiveTypographyProvider>;
}

const styles = StyleSheet.create({
  navigation: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, paddingHorizontal: 4, position: "absolute" },
  items: { gap: 6, paddingVertical: 8 },
  bottomItems: { alignItems: "center", flexDirection: "row", flexGrow: 1, justifyContent: "space-around", paddingVertical: 2 },
  item: { alignItems: "center", borderRadius: 12, gap: 4, justifyContent: "center", minHeight: 56, paddingHorizontal: 4, paddingVertical: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 16, textAlign: "center" },
  selected: { backgroundColor: colors.primarySoft },
  activeLabel: { color: colors.primaryDark }
});
