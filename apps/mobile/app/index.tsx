import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { colors } from "../src/theme/styles";

export default function IndexScreen() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={user ? "/scores" : "/login"} />;
}
