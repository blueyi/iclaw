import React, { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  showVoiceButton?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MessageInput({ onSend, disabled = false, showVoiceButton = false }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [voiceHint, setVoiceHint] = useState(false);
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const micScale = useSharedValue(1);

  const canSend = message.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(message.trim());
    setMessage("");
  };

  const handleVoicePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      setVoiceHint(true);
      setTimeout(() => setVoiceHint(false), 3000);
    } else {
      setVoiceHint(true);
      setTimeout(() => setVoiceHint(false), 3000);
    }
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
      {voiceHint ? (
        <View style={styles.voiceHint}>
          <Feather name="info" size={14} color={Colors.dark.textSecondary} />
          <Text style={styles.voiceHintText}>
            {Platform.OS === "web"
              ? "Run in Expo Go to use voice input"
              : "Voice input coming soon - use Expo Go for full experience"}
          </Text>
        </View>
      ) : null}
      <View style={styles.inputWrapper}>
        {showVoiceButton ? (
          <Pressable
            onPress={handleVoicePress}
            style={styles.voiceButton}
            testID="button-voice-input"
          >
            <Feather name="mic" size={20} color={Colors.dark.textTertiary} />
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Message I-Claw..."
          placeholderTextColor={Colors.dark.textTertiary}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={4000}
          editable={!disabled}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
          testID="input-message"
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
          testID="button-send-message"
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
    ...(Platform.OS === 'ios' ? Shadows.inputBar : { elevation: 4 }),
  },
  voiceHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
    backgroundColor: "rgba(155,92,255,0.08)",
    borderRadius: BorderRadius.sm,
  },
  voiceHintText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    minHeight: Spacing.inputHeight,
  },
  voiceButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
    maxHeight: 120,
    paddingVertical: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
    paddingHorizontal: Spacing.sm,
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
