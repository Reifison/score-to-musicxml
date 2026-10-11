import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { colors } from "../theme/colors";

const INTRO_DURATION = 1050;
const LOGO_SIZE = 176;

type StartupSplashProps = {
  ready: boolean;
  onFinish: () => void;
};

/** The native launch screen hands its centered logo to this musical opening. */
export function StartupSplash({ ready, onFinish }: StartupSplashProps) {
  const { height, width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [laidOut, setLaidOut] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [presented, setPresented] = useState(false);
  const [introFinished, setIntroFinished] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const [reveal] = useState(() => new Animated.Value(0));
  const [phrase] = useState(() => new Animated.Value(0));
  const introRemaining = useRef(INTRO_DURATION);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    let mounted = true;
    const motionSubscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => { if (mounted) setReduceMotion(true); });
    const appSubscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => {
      mounted = false;
      motionSubscription.remove();
      appSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!laidOut || !imageLoaded || reduceMotion === null || presented) return;
    // Wait for a painted logo, so hiding the native screen never exposes an empty frame.
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
      setPresented(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [imageLoaded, laidOut, presented, reduceMotion]);

  useEffect(() => {
    if (!presented || introFinished) return;
    // Reduce Motion skips the introductory wait as well as the spatial movement.
    if (reduceMotion) {
      setIntroFinished(true);
      return;
    }
    if (!active) return;
    const started = Date.now();
    const timeout = setTimeout(() => setIntroFinished(true), introRemaining.current);
    return () => {
      clearTimeout(timeout);
      introRemaining.current = Math.max(0, introRemaining.current - (Date.now() - started));
    };
  }, [active, introFinished, presented, reduceMotion]);

  useEffect(() => {
    if (!presented || !active) return;
    if (reduceMotion) {
      reveal.setValue(1);
      phrase.setValue(0);
      return;
    }
    const entrance = Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      isInteraction: false,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    const music = Animated.loop(Animated.timing(phrase, {
      toValue: 1,
      duration: 1400,
      isInteraction: false,
      easing: Easing.linear,
      useNativeDriver: true
    }));
    entrance.start();
    music.start();
    return () => {
      entrance.stop();
      music.stop();
      phrase.setValue(0);
    };
  }, [active, phrase, presented, reduceMotion, reveal]);

  useEffect(() => {
    if (!ready || !introFinished || !presented || !active) return;
    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 120 : 220,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true
    });
    exit.start(({ finished }) => { if (finished) finishRef.current(); });
    return () => exit.stop();
  }, [active, introFinished, opacity, presented, ready, reduceMotion]);

  const moving = presented && reduceMotion === false;
  const scale = moving ? phrase.interpolate({
    inputRange: [0, 0.18, 0.38, 0.56, 0.76, 1],
    outputRange: [1, 1.035, 1, 1.02, 1, 1]
  }) : 1;
  const noteOpacity = phrase.interpolate({
    inputRange: [0, 0.15, 0.65, 1],
    outputRange: [0, 0.85, 0.7, 0]
  });
  const compact = height < 520;
  const stageWidth = Math.min(328, width - 32);

  return (
    <Animated.View
      accessible
      accessibilityLabel="Conversor de Partituras. Abrindo o aplicativo."
      accessibilityRole="progressbar"
      accessibilityViewIsModal
      onLayout={() => setLaidOut(true)}
      style={[styles.screen, { opacity }]}
      testID="startup-splash"
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={[styles.composition, { top: height / 2 - LOGO_SIZE / 2 }]}
      >
        <View style={[styles.stage, { width: stageWidth }]}>
          {!compact && (
            <Animated.View style={[styles.staff, { opacity: Animated.multiply(reveal, 0.65) }]}>
              {[0, 1, 2, 3, 4].map((line) => <View key={line} style={styles.staffLine} />)}
            </Animated.View>
          )}
          <Animated.View style={[styles.logo, { transform: [{ scale }] }]}>
            <Image
              onLoadEnd={() => setImageLoaded(true)}
              source={require("../../assets/splash.png")}
              style={styles.logoImage}
            />
          </Animated.View>
          {moving && !compact && (
            <>
              <Animated.View style={[styles.note, {
                left: stageWidth / 2 + 78,
                top: 66,
                opacity: noteOpacity,
                transform: [
                  { translateX: phrase.interpolate({ inputRange: [0, 1], outputRange: [0, 42] }) },
                  { translateY: phrase.interpolate({ inputRange: [0, 1], outputRange: [0, -52] }) },
                  { rotate: "12deg" }
                ]
              }]}><MusicNote /></Animated.View>
              <Animated.View style={[styles.note, {
                left: stageWidth / 2 - 106,
                top: 44,
                opacity: noteOpacity,
                transform: [
                  { translateX: phrase.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) },
                  { translateY: phrase.interpolate({ inputRange: [0, 1], outputRange: [0, -36] }) },
                  { rotate: "-14deg" },
                  { scale: 0.8 }
                ]
              }]}><MusicNote /></Animated.View>
              <Animated.View style={[styles.note, {
                left: stageWidth / 2 + 90,
                top: 132,
                opacity: noteOpacity,
                transform: [
                  { translateX: phrase.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) },
                  { translateY: phrase.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
                  { scale: 0.65 }
                ]
              }]}><MusicNote /></Animated.View>
            </>
          )}
        </View>
        <Animated.View style={[styles.copy, { opacity: reveal, marginTop: compact ? 14 : 28 }]}>
          <Text style={[styles.name, compact && styles.nameCompact]}>Conversor de Partituras</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** A drawn eighth note keeps the opening independent of icon-font loading. */
function MusicNote() {
  return (
    <View style={styles.noteDrawing}>
      <View style={styles.noteStem} />
      <View style={styles.noteHead} />
      <View style={styles.noteFlag} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    zIndex: 10
  },
  composition: {
    alignItems: "center",
    position: "absolute",
    left: 0,
    right: 0
  },
  stage: {
    height: LOGO_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  staff: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 68,
    gap: 9
  },
  staffLine: {
    height: 1,
    backgroundColor: colors.line
  },
  copy: {
    paddingHorizontal: 28,
    maxWidth: 360
  },
  name: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 33,
    textAlign: "center"
  },
  nameCompact: {
    fontSize: 22,
    lineHeight: 28
  },
  note: {
    position: "absolute"
  },
  noteDrawing: {
    width: 24,
    height: 32
  },
  noteStem: {
    position: "absolute",
    width: 2.5,
    height: 25,
    left: 12,
    top: 0,
    borderRadius: 2,
    backgroundColor: colors.primary
  },
  noteHead: {
    position: "absolute",
    width: 12,
    height: 8,
    left: 2,
    top: 22,
    borderRadius: 6,
    backgroundColor: colors.primary,
    transform: [{ rotate: "-20deg" }]
  },
  noteFlag: {
    position: "absolute",
    width: 11,
    height: 3,
    left: 12,
    top: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    transform: [{ rotate: "35deg" }]
  }
});
