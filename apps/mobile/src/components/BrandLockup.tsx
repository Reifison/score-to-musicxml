import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/styles";

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.lockup}>
      <Image source={require("../../assets/icon.png")} style={compact ? styles.iconCompact : styles.icon} />
      <View style={styles.copy}>
        <Text style={compact ? styles.nameCompact : styles.name}>Conversor de Partituras</Text>
        {!compact ? <Text style={styles.tagline}>PDF e imagem prontos para editar</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    gap: 3
  },
  icon: {
    borderRadius: 20,
    height: 76,
    width: 76
  },
  iconCompact: {
    borderRadius: 12,
    height: 44,
    width: 44
  },
  lockup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  name: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    lineHeight: 28
  },
  nameCompact: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20
  },
  tagline: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  }
});
