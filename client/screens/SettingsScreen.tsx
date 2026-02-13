import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Switch,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SettingsData {
  openclawUrl: string;
  saveMessagesLocally: boolean;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const { biometricAvailable, biometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [saveMessages, setSaveMessages] = useState(true);

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settings) {
      setOpenclawUrl(settings.openclawUrl || "");
      setSaveMessages(settings.saveMessagesLocally ?? true);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<SettingsData>) => {
      const response = await apiRequest("PUT", "/api/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/messages");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleUrlBlur = () => {
    updateSettingsMutation.mutate({ openclawUrl });
  };

  const handleToggleSaveMessages = (value: boolean) => {
    setSaveMessages(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettingsMutation.mutate({ saveMessagesLocally: value });
  };

  const handleClearHistory = () => {
    if (Platform.OS === "web") {
      if (confirm("Are you sure you want to clear all conversation history? This cannot be undone.")) {
        clearHistoryMutation.mutate();
      }
    } else {
      Alert.alert(
        "Clear History",
        "Are you sure you want to clear all conversation history? This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear",
            style: "destructive",
            onPress: () => clearHistoryMutation.mutate(),
          },
        ]
      );
    }
  };

  const clearButtonScale = useSharedValue(1);

  const clearButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: clearButtonScale.value }],
  }));

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["3xl"],
        },
      ]}
    >
      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <ThemedText style={styles.sectionTitle}>Connection</ThemedText>
        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>OpenClaw Server URL</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="http://localhost:3000"
              placeholderTextColor={Colors.dark.textTertiary}
              value={openclawUrl}
              onChangeText={setOpenclawUrl}
              onBlur={handleUrlBlur}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <ThemedText style={styles.hint}>
              Enter the URL of your OpenClaw Gateway server
            </ThemedText>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <ThemedText style={styles.sectionTitle}>Preferences</ThemedText>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <ThemedText style={styles.toggleLabel}>
                Save Messages Locally
              </ThemedText>
              <ThemedText style={styles.toggleHint}>
                Keep conversation history on the server
              </ThemedText>
            </View>
            <Switch
              value={saveMessages}
              onValueChange={handleToggleSaveMessages}
              trackColor={{
                false: Colors.dark.backgroundTertiary,
                true: Colors.dark.link,
              }}
              thumbColor={Colors.dark.text}
            />
          </View>
        </View>
      </Animated.View>

      {biometricAvailable ? (
        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <ThemedText style={styles.sectionTitle}>Security</ThemedText>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <ThemedText style={styles.toggleLabel}>
                  Biometric Login
                </ThemedText>
                <ThemedText style={styles.toggleHint}>
                  Use Face ID or Touch ID for quick access
                </ThemedText>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={async (value) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (value) {
                    await enableBiometric();
                  } else {
                    await disableBiometric();
                  }
                }}
                trackColor={{
                  false: Colors.dark.backgroundTertiary,
                  true: Colors.dark.link,
                }}
                thumbColor={Colors.dark.text}
                testID="switch-biometric"
              />
            </View>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(300).springify()}>
        <ThemedText style={styles.sectionTitle}>Data</ThemedText>
        <AnimatedPressable
          style={[styles.destructiveButton, clearButtonAnimatedStyle]}
          onPress={handleClearHistory}
          onPressIn={() => {
            clearButtonScale.value = withSpring(0.98, { damping: 15 });
          }}
          onPressOut={() => {
            clearButtonScale.value = withSpring(1, { damping: 15 });
          }}
        >
          <Feather name="trash-2" size={20} color={Colors.dark.error} />
          <ThemedText style={styles.destructiveButtonText}>
            Clear Conversation History
          </ThemedText>
        </AnimatedPressable>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(400).springify()}
        style={styles.footer}
      >
        <ThemedText style={styles.version}>I-Claw v1.0.0</ThemedText>
        <ThemedText style={styles.credit}>
          Your OpenClaw in Your Pocket
        </ThemedText>
      </Animated.View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    marginTop: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  inputContainer: {
    gap: Spacing.sm,
  },
  label: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
  },
  hint: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  toggleHint: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginTop: Spacing.xs,
  },
  destructiveButton: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  destructiveButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "500",
  },
  footer: {
    alignItems: "center",
    marginTop: Spacing["4xl"],
    gap: Spacing.xs,
  },
  version: {
    ...Typography.small,
    color: Colors.dark.textTertiary,
  },
  credit: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
});
