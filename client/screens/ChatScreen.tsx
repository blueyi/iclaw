import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyChat } from "@/components/EmptyChat";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
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

  const { data: messages = [], isLoading, refetch } = useQuery<MessageData[]>({
    queryKey: ["/api/messages"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/messages", { content });
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
      sendMessageMutation.mutate(message);
    },
    [sendMessageMutation]
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
      <MessageInput
        onSend={handleSend}
        disabled={sendMessageMutation.isPending}
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
});
