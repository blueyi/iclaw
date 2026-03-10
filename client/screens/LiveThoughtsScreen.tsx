import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

type ThoughtType = 'thinking' | 'tool_call' | 'tool_result' | 'planning' | 'action';

interface AgentThought {
  id: string;
  profileId: string;
  type: ThoughtType;
  content: string;
  metadata: string | null;
  sessionId: string | null;
  createdAt: string;
}

const THOUGHT_CONFIG: Record<ThoughtType, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  thinking: { icon: 'cpu', color: '#9b5cff', label: 'Thinking' },
  tool_call: { icon: 'terminal', color: '#22d3ee', label: 'Tool Call' },
  tool_result: { icon: 'check-circle', color: '#10b981', label: 'Result' },
  planning: { icon: 'compass', color: '#6366f1', label: 'Planning' },
  action: { icon: 'zap', color: '#F59E0B', label: 'Action' },
};

function ThoughtItem({ item }: { item: AgentThought }) {
  const config = THOUGHT_CONFIG[item.type as ThoughtType] || THOUGHT_CONFIG.thinking;
  const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let meta: Record<string, string> | null = null;
  try {
    if (item.metadata) meta = JSON.parse(item.metadata);
  } catch {}

  return (
    <View style={styles.thoughtCard} testID={`thought-item-${item.id}`}>
      <View style={styles.thoughtHeader}>
        <View style={[styles.thoughtIcon, { backgroundColor: `${config.color}20` }]}>
          <Feather name={config.icon} size={16} color={config.color} />
        </View>
        <View style={styles.thoughtMeta}>
          <Text style={[styles.thoughtLabel, { color: config.color }]}>{config.label}</Text>
          <Text style={styles.thoughtTime}>{time}</Text>
        </View>
      </View>
      <Text style={styles.thoughtContent}>{item.content}</Text>
      {meta ? (
        <View style={styles.metaRow}>
          {Object.entries(meta).map(([key, value]) => (
            <View key={key} style={styles.metaBadge}>
              <Text style={styles.metaText}>{key}: {value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="activity" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Agent Activity</Text>
      <Text style={styles.emptyText}>
        When your OpenClaw agent processes requests, its chain of thought will appear here in real-time.
      </Text>
      <Text style={styles.emptyHint}>
        Connect to your Gateway to start seeing live thoughts.
      </Text>
    </View>
  );
}

export default function LiveThoughtsScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profileId } = useProfile();
  const flatListRef = useRef<FlatList>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: thoughts = [], isLoading, refetch, isRefetching } = useQuery<AgentThought[]>({
    queryKey: ['/api/agent-thoughts', profileId],
    enabled: !!profileId,
    refetchInterval: 3000,
  });

  const sortedThoughts = [...thoughts].reverse();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <View style={styles.container} testID="screen-live-thoughts">
      <View style={[styles.statusBar, { marginTop: headerHeight + Spacing.sm }]}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Live Feed</Text>
        <Text style={styles.statusCount}>{thoughts.length} entries</Text>
        <Pressable
          onPress={() => setAutoScroll(!autoScroll)}
          style={[styles.scrollToggle, autoScroll ? styles.scrollToggleActive : null]}
          testID="button-toggle-autoscroll"
        >
          <Feather name="arrow-down-circle" size={16} color={autoScroll ? '#10b981' : Colors.dark.textTertiary} />
          <Text style={[styles.scrollToggleText, autoScroll ? styles.scrollToggleTextActive : null]}>Auto-scroll</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={sortedThoughts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ThoughtItem item={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
          }
          onContentSizeChange={() => {
            if (autoScroll && sortedThoughts.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: '600',
  },
  statusCount: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    flex: 1,
  },
  scrollToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  scrollToggleActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  scrollToggleText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  scrollToggleTextActive: {
    color: '#10b981',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  thoughtCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  thoughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  thoughtIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thoughtMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  thoughtLabel: {
    ...Typography.small,
    fontWeight: '600',
  },
  thoughtTime: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  thoughtContent: {
    ...Typography.small,
    color: Colors.dark.textBase,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  metaBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['3xl'],
    paddingTop: 80,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  emptyHint: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
  },
});
