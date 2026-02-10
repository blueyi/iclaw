import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
  Pressable,
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

import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyChat } from "@/components/EmptyChat";
import { useProfile } from "@/contexts/ProfileContext";
import { Colors, Gradients, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Message } from "@shared/schema";

interface MessageData {
  id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
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
      return { previousMessages };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<MessageData[]>(["/api/messages"], (old) => {
        const filtered = (old || []).filter((m) => !m.id.startsWith("temp-"));
        return [...filtered, data.userMessage, data.assistantMessage];
      });
      setIsTyping(false);
      incrementLocalUsage();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error, _, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages"], context.previousMessages);
      }
      setIsTyping(false);
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
      <FlatList
        ref={flatListRef}
        data={reversedMessages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        inverted={messages.length > 0}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: messages.length > 0 ? Spacing.lg : headerHeight + Spacing.xl,
            paddingBottom: headerHeight + Spacing.xl,
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
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
});
