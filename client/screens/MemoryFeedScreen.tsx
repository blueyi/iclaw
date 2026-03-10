import React, { useState, useCallback } from 'react';
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

type MemoryType = 'journal' | 'reflection' | 'learning' | 'observation';

interface AgentMemory {
  id: string;
  profileId: string;
  title: string;
  content: string;
  memoryType: MemoryType;
  tags: string | null;
  importance: number;
  createdAt: string;
}

const MEMORY_CONFIG: Record<MemoryType, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  journal: { icon: 'book-open', color: '#9b5cff', label: 'Journal' },
  reflection: { icon: 'sunset', color: '#F59E0B', label: 'Reflection' },
  learning: { icon: 'award', color: '#22d3ee', label: 'Learning' },
  observation: { icon: 'eye', color: '#10b981', label: 'Observation' },
};

const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'journal', label: 'Journals' },
  { key: 'reflection', label: 'Reflections' },
  { key: 'learning', label: 'Learnings' },
  { key: 'observation', label: 'Observations' },
];

function ImportanceStars({ count }: { count: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Feather
          key={i}
          name="star"
          size={10}
          color={i <= count ? '#FFD700' : 'rgba(255,255,255,0.1)'}
        />
      ))}
    </View>
  );
}

function MemoryCard({ item }: { item: AgentMemory }) {
  const [expanded, setExpanded] = useState(false);
  const config = MEMORY_CONFIG[item.memoryType] || MEMORY_CONFIG.journal;
  const date = new Date(item.createdAt);
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const tags = item.tags ? item.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const isLong = item.content.length > 150;

  return (
    <View style={styles.memoryCard} testID={`memory-item-${item.id}`}>
      <View style={styles.timelineConnector}>
        <View style={[styles.timelineDot, { backgroundColor: config.color }]} />
        <View style={styles.timelineLine} />
      </View>
      <Pressable
        style={styles.memoryContent}
        onPress={() => { if (isLong) setExpanded(!expanded); }}
        testID={`memory-expand-${item.id}`}
      >
        <View style={styles.memoryHeader}>
          <View style={[styles.typeBadge, { backgroundColor: `${config.color}15` }]}>
            <Feather name={config.icon} size={12} color={config.color} />
            <Text style={[styles.typeLabel, { color: config.color }]}>{config.label}</Text>
          </View>
          <ImportanceStars count={item.importance} />
        </View>
        <Text style={styles.memoryTitle}>{item.title}</Text>
        <Text style={styles.memoryText} numberOfLines={expanded ? undefined : 3}>
          {item.content}
        </Text>
        {isLong ? (
          <Text style={styles.expandText}>{expanded ? 'Show less' : 'Show more'}</Text>
        ) : null}
        {tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagBadge}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.memoryFooter}>
          <Text style={styles.memoryDate}>{dateStr}</Text>
          <Text style={styles.memoryTime}>{timeStr}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="book" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Memories Yet</Text>
      <Text style={styles.emptyText}>
        Your agent's journal entries, reflections, learnings, and observations will appear here as a timeline.
      </Text>
      <Text style={styles.emptyHint}>
        Connect to your OpenClaw Gateway to start recording agent memories.
      </Text>
    </View>
  );
}

export default function MemoryFeedScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profileId } = useProfile();
  const [activeFilter, setActiveFilter] = useState('all');

  const queryType = activeFilter === 'all' ? undefined : activeFilter;
  const memoriesPath = queryType
    ? `/api/memories/${profileId}?type=${queryType}`
    : `/api/memories/${profileId}`;

  const { data: memories = [], isLoading, refetch, isRefetching } = useQuery<AgentMemory[]>({
    queryKey: [memoriesPath],
    enabled: !!profileId,
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <View style={styles.container} testID="screen-memory-feed">
      <View style={[styles.filterBar, { marginTop: headerHeight + Spacing.sm }]}>
        <FlatList
          data={FILTER_TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.filterTab, activeFilter === item.key ? styles.filterTabActive : null]}
              onPress={() => setActiveFilter(item.key)}
              testID={`filter-${item.key}`}
            >
              <Text style={[styles.filterText, activeFilter === item.key ? styles.filterTextActive : null]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MemoryCard item={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
          }
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
  filterBar: {
    paddingBottom: Spacing.sm,
  },
  filterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterTabActive: {
    backgroundColor: 'rgba(155,92,255,0.15)',
    borderColor: 'rgba(155,92,255,0.3)',
  },
  filterText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  filterTextActive: {
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  memoryCard: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  timelineConnector: {
    alignItems: 'center',
    width: 24,
    marginRight: Spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 4,
  },
  memoryContent: {
    flex: 1,
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeLabel: {
    ...Typography.caption,
    fontWeight: '600',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  memoryTitle: {
    ...Typography.small,
    fontWeight: '700',
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  memoryText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  expandText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    marginTop: Spacing.xs,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  tagBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  tagText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  memoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  memoryDate: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  memoryTime: {
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
