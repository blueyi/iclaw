import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyChat } from "@/components/EmptyChat";
import { AgentStatusWidget } from "@/components/AgentStatusWidget";
import { useAgentStatus } from "@/contexts/WebSocketContext";
import { useProfile } from "@/contexts/ProfileContext";
import { Colors, Gradients, Glass, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Message } from "@shared/schema";

interface MessageData {
  id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const MODELS: ModelOption[] = [
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", icon: "hexagon", color: "#d4a574" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", icon: "aperture", color: "#10b981" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", icon: "star", color: "#60a5fa" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", icon: "layers", color: "#9b5cff" },
  { id: "ollama-local", name: "Ollama (Local)", provider: "Local", icon: "hard-drive", color: "#22d3ee" },
];

type AgentState = "idle" | "thinking" | "executing";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const wsAgentStatus = useAgentStatus();
  const [localAgentState, setLocalAgentState] = useState<AgentState>("idle");
  const agentState: AgentState = wsAgentStatus.state !== "idle" ? wsAgentStatus.state : localAgentState;
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    profile,
    canSendMessage,
    remainingMessages,
    messagesUsed,
    messageLimit,
    incrementLocalUsage,
    refreshUsage,
  } = useProfile();

  const isPro = profile?.isPro || false;

  const { data: messages = [], isLoading, refetch } = useQuery<MessageData[]>({
    queryKey: ["/api/messages"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/messages", {
        content,
        profileId: profile?.id,
        model: selectedModel.id,
      });
      if (!response.ok) {
        const errData = await response.json();
        if (errData.upgrade) {
          setLimitReached(true);
        }
        throw new Error(errData.error || "Failed to send message");
      }
      return response.json();
    },
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/messages"] });
      const previousMessages = queryClient.getQueryData<MessageData[]>(["/api/messages"]);

      const optimisticMessage: MessageData = {
        id: `temp-${Date.now()}`,
        content,
        role: "user",
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<MessageData[]>(["/api/messages"], (old) => [
        ...(old || []),
        optimisticMessage,
      ]);

      setIsTyping(true);
      setLocalAgentState("thinking");
      return { previousMessages };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<MessageData[]>(["/api/messages"], (old) => {
        const filtered = (old || []).filter((m) => !m.id.startsWith("temp-"));
        return [...filtered, data.userMessage, data.assistantMessage];
      });
      setIsTyping(false);
      setLocalAgentState("idle");
      incrementLocalUsage();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (speechEnabled && data.assistantMessage?.content) {
        Speech.speak(data.assistantMessage.content, {
          language: "en-US",
          rate: 0.9,
          pitch: 1.0,
        });
      }
    },
    onError: (error, _, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages"], context.previousMessages);
      }
      setIsTyping(false);
      setLocalAgentState("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleSend = useCallback(
    (message: string) => {
      if (!canSendMessage) {
        setLimitReached(true);
        return;
      }
      setLimitReached(false);
      sendMessageMutation.mutate(message);
    },
    [sendMessageMutation, canSendMessage]
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: MessageData; index: number }) => (
      <MessageBubble
        content={item.content}
        role={item.role as "user" | "assistant"}
        timestamp={new Date(item.createdAt)}
        index={index}
      />
    ),
    []
  );

  const keyExtractor = useCallback((item: MessageData) => item.id, []);

  const reversedMessages = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.modelSelector}
          onPress={() => setShowModelPicker(true)}
          testID="button-model-selector"
        >
          <Feather name={selectedModel.icon} size={14} color={selectedModel.color} />
          <Text style={styles.modelName} numberOfLines={1}>{selectedModel.name}</Text>
          <Feather name="chevron-down" size={14} color={Colors.dark.textSecondary} />
        </Pressable>

        <View style={styles.topBarRight}>
          <Pressable
            style={[styles.speechToggle, speechEnabled ? styles.speechActive : null]}
            onPress={() => {
              setSpeechEnabled(!speechEnabled);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            testID="button-speech-toggle"
          >
            <Feather
              name={speechEnabled ? "volume-2" : "volume-x"}
              size={16}
              color={speechEnabled ? "#22d3ee" : Colors.dark.textTertiary}
            />
          </Pressable>
          <AgentStatusWidget state={agentState} compact />
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={reversedMessages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        inverted={messages.length > 0}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: messages.length > 0 ? Spacing.lg : headerHeight + Spacing["3xl"],
            paddingBottom: headerHeight + Spacing["3xl"],
          },
        ]}
        ListEmptyComponent={<EmptyChat />}
        ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={Colors.dark.link}
            colors={[Colors.dark.link]}
          />
        }
      />

      {limitReached ? (
        <View style={styles.limitBanner}>
          <View style={styles.limitContent}>
            <Feather name="lock" size={20} color="#FFD700" />
            <View style={styles.limitTextContainer}>
              <Text style={styles.limitTitle}>Daily Limit Reached</Text>
              <Text style={styles.limitSubtitle}>
                Upgrade for $9.99/mo or hold $100 in $CLAW for <Text style={{ fontStyle: 'italic', color: '#b44dff' }}>Free Access</Text>
              </Text>
            </View>
          </View>
          <Pressable
            style={styles.upgradeButton}
            onPress={() => {
              setLimitReached(false);
              navigation.goBack();
            }}
            testID="button-upgrade-pro"
          >
            <LinearGradient
              colors={Gradients.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.upgradeGradient}
            >
              <Feather name="zap" size={16} color="#000" />
              <Text style={styles.upgradeText}>Get Pro</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      {!isPro && !limitReached ? (
        <View style={styles.usageBanner}>
          <Feather name="message-circle" size={14} color={Colors.dark.textSecondary} />
          <Text style={styles.usageText}>
            {remainingMessages} / {messageLimit} messages remaining today
          </Text>
        </View>
      ) : null}

      <MessageInput
        onSend={handleSend}
        disabled={sendMessageMutation.isPending || limitReached}
        showVoiceButton
      />

      <Modal
        visible={showModelPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowModelPicker(false)}>
          <View style={styles.modelPickerContainer}>
            <Text style={styles.modelPickerTitle}>Select Model</Text>
            <Text style={styles.modelPickerSubtitle}>Choose your AI model for this conversation</Text>
            {MODELS.map((model) => (
              <Pressable
                key={model.id}
                style={[
                  styles.modelOption,
                  selectedModel.id === model.id ? styles.modelOptionSelected : null,
                ]}
                onPress={() => {
                  setSelectedModel(model);
                  setShowModelPicker(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                testID={`button-model-${model.id}`}
              >
                <View style={[styles.modelIconContainer, { backgroundColor: `${model.color}15` }]}>
                  <Feather name={model.icon} size={20} color={model.color} />
                </View>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelOptionName}>{model.name}</Text>
                  <Text style={styles.modelProvider}>{model.provider}</Text>
                </View>
                {selectedModel.id === model.id ? (
                  <Feather name="check-circle" size={20} color="#9b5cff" />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modelSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    maxWidth: 200,
  },
  modelName: {
    ...Typography.caption,
    color: Colors.dark.textBase,
    fontWeight: "600",
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  speechToggle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  speechActive: {
    backgroundColor: "rgba(34,211,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.2)",
  },
  listContent: {
    flexGrow: 1,
  },
  limitBanner: {
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 215, 0, 0.2)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  limitContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  limitTextContainer: {
    flex: 1,
  },
  limitTitle: {
    color: "#FFD700",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  limitSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  upgradeButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  upgradeGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  upgradeText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  usageBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  usageText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  modelPickerContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.card,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modelPickerTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  modelPickerSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
  },
  modelOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.innerCard,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  modelOptionSelected: {
    backgroundColor: "rgba(155,92,255,0.08)",
    borderColor: "rgba(155,92,255,0.2)",
  },
  modelIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  modelInfo: {
    flex: 1,
  },
  modelOptionName: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modelProvider: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
});
