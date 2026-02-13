import React, { useState } from "react";
import { View, StyleSheet, Dimensions, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface MessageBubbleProps {
  content: string;
  role: "user" | "assistant";
  timestamp?: Date;
  index?: number;
}

const { width: screenWidth } = Dimensions.get("window");
const maxBubbleWidth = screenWidth * 0.75;

export function MessageBubble({
  content,
  role,
  timestamp,
  index = 0,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const scale = useSharedValue(1);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const formatTime = (date?: Date) => {
    if (!date) return "";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  const handleTTSPress = async () => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      try {
        await Speech.speak(content, {
          language: "en",
          rate: 0.9,
          onDone: () => setIsSpeaking(false),
        });
      } catch (error) {
        setIsSpeaking(false);
      }
    }
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 50).springify()}
      style={[
        styles.container,
        isUser ? styles.containerUser : styles.containerAssistant,
        animatedStyle,
      ]}
    >
      {timestamp ? (
        <ThemedText
          style={[
            styles.timestamp,
            isUser ? styles.timestampUser : styles.timestampAssistant,
          ]}
        >
          {formatTime(timestamp)}
        </ThemedText>
      ) : null}
      {isUser ? (
        <View style={[styles.bubble, styles.userBubble]}>
          <ThemedText style={styles.messageText}>{content}</ThemedText>
        </View>
      ) : (
        <View>
          <LinearGradient
            colors={['rgba(155,92,255,0.35)', 'rgba(99,102,241,0.3)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.assistantBubble]}
          >
            <ThemedText style={styles.messageText}>{content}</ThemedText>
          </LinearGradient>
          <View style={styles.ttsRow}>
            <Pressable
              onPress={handleTTSPress}
              testID={`button-tts-${index}`}
              style={styles.ttsButton}
            >
              <Feather
                name={isSpeaking ? "volume-2" : "volume-x"}
                size={14}
                color={Colors.dark.textTertiary}
              />
            </Pressable>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs,
    marginHorizontal: Spacing.lg,
  },
  containerUser: {
    alignItems: "flex-end",
  },
  containerAssistant: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: maxBubbleWidth,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.message,
  },
  userBubble: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: Colors.dark.link,
  },
  assistantBubble: {
    borderRadius: BorderRadius.message,
  },
  messageText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  timestamp: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginBottom: Spacing.xs,
  },
  timestampUser: {
    marginRight: Spacing.xs,
  },
  timestampAssistant: {
    marginLeft: Spacing.xs,
  },
  ttsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  ttsButton: {
    padding: 4,
  },
});
