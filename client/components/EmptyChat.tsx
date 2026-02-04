import React from "react";
import { View, StyleSheet, Image, Dimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, Typography } from "@/constants/theme";

const { width: screenWidth } = Dimensions.get("window");

export function EmptyChat() {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.container}>
      <Image
        source={require("../../assets/images/empty-chat.png")}
        style={styles.illustration}
        resizeMode="contain"
      />
      <ThemedText style={styles.title}>Start a Conversation</ThemedText>
      <ThemedText style={styles.subtitle}>
        Send a message to your AI assistant. Connect to your OpenClaw Gateway in Settings to unlock full capabilities.
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  illustration: {
    width: screenWidth * 0.5,
    height: screenWidth * 0.5,
    marginBottom: Spacing["2xl"],
    opacity: 0.9,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
});
