import React, { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);

  const canSend = message.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(message.trim());
    setMessage("");
  };

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (canSend) {
      scale.value = withSpring(0.9, { damping: 15 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, Spacing.md) },
      ]}
    >
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder="Message OpenClaw..."
          placeholderTextColor={Colors.dark.textTertiary}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={4000}
          editable={!disabled}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        <AnimatedPressable
          onPress={handleSend}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={!canSend}
          style={[
            styles.sendButton,
            canSend ? styles.sendButtonActive : styles.sendButtonDisabled,
            animatedButtonStyle,
          ]}
        >
          <Feather
            name="send"
            size={20}
            color={canSend ? Colors.dark.text : Colors.dark.textTertiary}
          />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    ...Platform.select({
      ios: Shadows.inputBar,
      android: { elevation: 4 },
    }),
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    minHeight: Spacing.inputHeight,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
    maxHeight: 120,
    paddingVertical: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonActive: {
    backgroundColor: Colors.dark.link,
  },
  sendButtonDisabled: {
    backgroundColor: "transparent",
  },
});
