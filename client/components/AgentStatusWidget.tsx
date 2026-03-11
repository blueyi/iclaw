import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

type AgentState = "idle" | "thinking" | "executing" | "waiting" | "listening";

interface AgentStatusWidgetProps {
  state: AgentState;
  onPress?: () => void;
  compact?: boolean;
}

const STATE_CONFIG: Record<AgentState, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  idle: { label: "Idle", icon: "circle", color: Colors.dark.textTertiary },
  thinking: { label: "Thinking...", icon: "cpu", color: "#9b5cff" },
  executing: { label: "Executing...", icon: "zap", color: "#22d3ee" },
  waiting: { label: "Awaiting Approval", icon: "clock", color: "#F59E0B" },
  listening: { label: "Listening...", icon: "mic", color: "#10b981" },
};

export function AgentStatusWidget({ state, onPress, compact = false }: AgentStatusWidgetProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (state !== "idle") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 800 }),
          withTiming(0.6, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [state]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const config = STATE_CONFIG[state];

  if (compact) {
    return (
      <Pressable onPress={onPress} style={styles.compactContainer} testID="widget-agent-status">
        <View style={styles.dotWrapper}>
          <Animated.View style={[styles.pulse, { backgroundColor: config.color }, pulseStyle]} />
          <View style={[styles.dot, { backgroundColor: config.color }]} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.container} testID="widget-agent-status">
      <View style={styles.dotWrapper}>
        <Animated.View style={[styles.pulse, { backgroundColor: config.color }, pulseStyle]} />
        <View style={[styles.dot, { backgroundColor: config.color }]} />
      </View>
      <Feather name={config.icon} size={14} color={config.color} />
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  compactContainer: {
    padding: Spacing.xs,
  },
  dotWrapper: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: "absolute",
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...Typography.caption,
    fontWeight: "600",
  },
});
