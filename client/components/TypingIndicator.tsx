import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";

import { Colors, Spacing, BorderRadius } from "@/constants/theme";

export function TypingIndicator() {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const duration = 400;
    const delay = 150;

    dot1.value = withRepeat(
      withSequence(
        withTiming(-6, { duration }),
        withTiming(0, { duration })
      ),
      -1,
      false
    );

    dot2.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-6, { duration }),
          withTiming(0, { duration })
        ),
        -1,
        false
      )
    );

    dot3.value = withDelay(
      delay * 2,
      withRepeat(
        withSequence(
          withTiming(-6, { duration }),
          withTiming(0, { duration })
        ),
        -1,
        false
      )
    );
  }, []);

  const animatedDot1 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1.value }],
  }));

  const animatedDot2 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2.value }],
  }));

  const animatedDot3 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3.value }],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.gradientStart, Colors.dark.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bubble}
      >
        <View style={styles.dotsContainer}>
          <Animated.View style={[styles.dot, animatedDot1]} />
          <Animated.View style={[styles.dot, animatedDot2]} />
          <Animated.View style={[styles.dot, animatedDot3]} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    marginVertical: Spacing.xs,
    marginHorizontal: Spacing.lg,
  },
  bubble: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.message,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
});
