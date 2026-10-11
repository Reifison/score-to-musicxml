import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useWindowDimensions, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { activeBottomNavKey, bottomNavItemsForRole } from "../navigation/bottomNavModel";
import { colors } from "../theme/styles";

export const bottomNavHeight = 104;

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const expandedAndroid = Platform.OS === "android" && width >= 600;
  const items = bottomNavItemsForRole(user?.role);
  const activeKey = activeBottomNavKey(pathname);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, expandedAndroid ? styles.railWrap : styles.bottomWrap, expandedAndroid && { paddingBottom: insets.bottom + 12, paddingTop: insets.top + 12 }]}>
      <View style={[styles.bar, expandedAndroid ? styles.rail : styles.bottomBar, !expandedAndroid && { paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 18 : 10) }]}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.key}
              onPress={() => item.key === "home" ? router.replace(item.href) : router.push(item.href)}
              style={[styles.item, expandedAndroid && styles.railItem, active && styles.itemActive]}
            >
              <Ionicons color={active ? colors.primaryDark : colors.faint} name={item.icon} size={23} />
              <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.panel,
    gap: 4,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.12,
    shadowRadius: 24
  },
  bottomBar: {
    alignSelf: "center",
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    maxWidth: 760,
    paddingHorizontal: 8,
    paddingTop: 8,
    width: "100%"
  },
  item: {
    alignItems: "center",
    borderRadius: 20,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 56,
    minWidth: 52,
    paddingHorizontal: 5
  },
  itemActive: {
    backgroundColor: colors.primarySoft
  },
  railItem: {
    flex: 0,
    width: 72
  },
  label: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    textAlign: "center"
  },
  labelActive: {
    color: colors.primaryDark
  },
  wrap: {
    position: "absolute",
    zIndex: 20
  },
  bottomWrap: {
    bottom: 0,
    left: 0,
    right: 0
  },
  rail: {
    alignSelf: "stretch",
    borderRightColor: colors.line,
    borderRightWidth: 1,
    gap: 12,
    justifyContent: "center",
    shadowOffset: { width: 12, height: 0 },
    shadowRadius: 18,
    width: 88
  },
  railWrap: {
    bottom: 0,
    left: 0,
    top: 0,
    width: 88
  }
});
