import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { apiRequest } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

type MemoryType = 'journal' | 'reflection' | 'learning' | 'observation';
type MemoryFileTab = 'timeline' | 'memory_md' | 'user_md' | 'daily_logs';
type SortMode = 'newest' | 'oldest' | 'importance';

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

interface MemoryFile {
  name: string;
  content: string;
  lastModified: string;
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

const FILE_TABS: { key: MemoryFileTab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'timeline', label: 'Timeline', icon: 'clock' },
  { key: 'memory_md', label: 'MEMORY.md', icon: 'database' },
  { key: 'user_md', label: 'USER.md', icon: 'user' },
  { key: 'daily_logs', label: 'Daily Logs', icon: 'calendar' },
];

const SORT_OPTIONS: { key: SortMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'newest', label: 'Newest', icon: 'arrow-down' },
  { key: 'oldest', label: 'Oldest', icon: 'arrow-up' },
  { key: 'importance', label: 'Importance', icon: 'star' },
];

function InteractiveStars({ count, onRate }: { count: number; onRate?: (rating: number) => void }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onRate ? onRate(i) : undefined}
          hitSlop={4}
          testID={`star-${i}`}
        >
          <Feather
            name="star"
            size={12}
            color={i <= count ? '#FFD700' : 'rgba(255,255,255,0.15)'}
          />
        </Pressable>
      ))}
    </View>
  );
}

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

function MemoryCard({ item, onRateImportance }: { item: AgentMemory; onRateImportance: (id: string, rating: number) => void }) {
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
          <InteractiveStars count={item.importance} onRate={(r) => onRateImportance(item.id, r)} />
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

function SyncStatusBar({ lastSyncTime, isSyncing, onSync }: { lastSyncTime: string | null; isSyncing: boolean; onSync: () => void }) {
  const formatSyncTime = (time: string | null) => {
    if (!time) return 'Never synced';
    const date = new Date(time);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.syncBar}>
      <View style={styles.syncInfo}>
        <View style={[styles.syncDot, { backgroundColor: lastSyncTime ? Colors.dark.success : Colors.dark.warning }]} />
        <Text style={styles.syncText}>Last sync: {formatSyncTime(lastSyncTime)}</Text>
      </View>
      <Pressable
        style={[styles.syncButton, isSyncing ? styles.syncButtonDisabled : null]}
        onPress={onSync}
        disabled={isSyncing}
        testID="button-sync-agent"
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        ) : (
          <Feather name="refresh-cw" size={14} color={Colors.dark.primary} />
        )}
        <Text style={styles.syncButtonText}>{isSyncing ? 'Syncing...' : 'Sync with Agent'}</Text>
      </Pressable>
    </View>
  );
}

function MemoryFileEditor({ 
  fileName, 
  content, 
  isEditing, 
  onToggleEdit, 
  onSave, 
  lastModified 
}: { 
  fileName: string; 
  content: string; 
  isEditing: boolean; 
  onToggleEdit: () => void; 
  onSave: (newContent: string) => void; 
  lastModified: string | null;
}) {
  const [editContent, setEditContent] = useState(content);
  const inputRef = useRef<TextInput>(null);

  const handleSave = () => {
    onSave(editContent);
  };

  const handleCancel = () => {
    setEditContent(content);
    onToggleEdit();
  };

  return (
    <View style={styles.fileEditorContainer}>
      <View style={styles.fileEditorHeader}>
        <View style={styles.fileNameRow}>
          <Feather name="file-text" size={16} color={Colors.dark.primary} />
          <Text style={styles.fileName}>{fileName}</Text>
        </View>
        <View style={styles.fileActions}>
          {lastModified ? (
            <Text style={styles.lastModifiedText}>
              {new Date(lastModified).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : null}
          {isEditing ? (
            <View style={styles.editActions}>
              <Pressable style={styles.cancelButton} onPress={handleCancel} testID="button-cancel-edit">
                <Feather name="x" size={16} color={Colors.dark.error} />
              </Pressable>
              <Pressable style={styles.saveButton} onPress={handleSave} testID="button-save-file">
                <Feather name="check" size={16} color={Colors.dark.success} />
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.editButton} onPress={onToggleEdit} testID="button-edit-file">
              <Feather name="edit-2" size={14} color={Colors.dark.primary} />
              <Text style={styles.editButtonText}>Edit</Text>
            </Pressable>
          )}
        </View>
      </View>
      {isEditing ? (
        <TextInput
          ref={inputRef}
          style={styles.fileEditInput}
          value={editContent}
          onChangeText={setEditContent}
          multiline
          textAlignVertical="top"
          placeholderTextColor={Colors.dark.textPlaceholder}
          placeholder={`Enter ${fileName} content...`}
          testID="input-file-content"
        />
      ) : (
        <ScrollView style={styles.filePreview} showsVerticalScrollIndicator={false}>
          <Text style={styles.fileContent}>
            {content || `No content in ${fileName} yet. Tap Edit to add content or sync with your agent.`}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function DailyLogsView({ logs }: { logs: MemoryFile[] }) {
  if (logs.length === 0) {
    return (
      <View style={styles.emptyFileContainer}>
        <Feather name="calendar" size={36} color={Colors.dark.textTertiary} />
        <Text style={styles.emptyFileTitle}>No Daily Logs</Text>
        <Text style={styles.emptyFileText}>
          Daily activity logs from your agent will appear here after syncing.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.logsContainer} showsVerticalScrollIndicator={false}>
      {logs.map((log, index) => (
        <View key={log.name} style={styles.logEntry}>
          <View style={styles.logHeader}>
            <View style={styles.logDateBadge}>
              <Feather name="calendar" size={12} color={Colors.dark.primary} />
              <Text style={styles.logDateText}>{log.name}</Text>
            </View>
            {log.lastModified ? (
              <Text style={styles.logModified}>
                {new Date(log.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            ) : null}
          </View>
          <Text style={styles.logContent} numberOfLines={6}>
            {log.content}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function MemoryFeedScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const profileId = profile?.id;
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeFileTab, setActiveFileTab] = useState<MemoryFileTab>('timeline');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [isEditingMemoryMd, setIsEditingMemoryMd] = useState(false);
  const [isEditingUserMd, setIsEditingUserMd] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const queryType = activeFilter === 'all' ? undefined : activeFilter;
  const memoriesPath = queryType
    ? `/api/memories/${profileId}?type=${queryType}`
    : `/api/memories/${profileId}`;

  const { data: memories = [], isLoading, refetch, isRefetching } = useQuery<AgentMemory[]>({
    queryKey: [memoriesPath],
    enabled: !!profileId,
  });

  const { data: memoryMdFile } = useQuery<MemoryFile>({
    queryKey: [`/api/memories/${profileId}/file/memory_md`],
    enabled: !!profileId,
  });

  const { data: userMdFile } = useQuery<MemoryFile>({
    queryKey: [`/api/memories/${profileId}/file/user_md`],
    enabled: !!profileId,
  });

  const { data: dailyLogs = [] } = useQuery<MemoryFile[]>({
    queryKey: [`/api/memories/${profileId}/daily-logs`],
    enabled: !!profileId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/memories/${profileId}/sync`);
      return res.json();
    },
    onSuccess: () => {
      setLastSyncTime(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: [`/api/memories/${profileId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/memories/${profileId}/file/memory_md`] });
      queryClient.invalidateQueries({ queryKey: [`/api/memories/${profileId}/file/user_md`] });
      queryClient.invalidateQueries({ queryKey: [`/api/memories/${profileId}/daily-logs`] });
    },
  });

  const saveFileMutation = useMutation({
    mutationFn: async ({ fileType, content }: { fileType: string; content: string }) => {
      const res = await apiRequest('PUT', `/api/memories/${profileId}/file/${fileType}`, { content });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/memories/${profileId}/file/${variables.fileType}`] });
      if (variables.fileType === 'memory_md') setIsEditingMemoryMd(false);
      if (variables.fileType === 'user_md') setIsEditingUserMd(false);
    },
  });

  const rateImportanceMutation = useMutation({
    mutationFn: async ({ memoryId, importance }: { memoryId: string; importance: number }) => {
      const res = await apiRequest('PUT', `/api/memories/${memoryId}/importance`, { importance });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [memoriesPath] });
    },
  });

  const handleRateImportance = useCallback((memoryId: string, rating: number) => {
    rateImportanceMutation.mutate({ memoryId, importance: rating });
  }, [rateImportanceMutation]);

  const sortedMemories = [...memories].sort((a, b) => {
    switch (sortMode) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'importance':
        return b.importance - a.importance;
      default:
        return 0;
    }
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSync = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  const renderTimelineView = () => (
    <>
      <View style={styles.timelineToolbar}>
        <View style={styles.filterBar}>
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
        <View style={styles.sortRow}>
          <Pressable
            style={styles.sortToggle}
            onPress={() => setShowSortMenu(!showSortMenu)}
            testID="button-sort"
          >
            <Feather name="sliders" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.sortLabel}>
              {SORT_OPTIONS.find(s => s.key === sortMode)?.label}
            </Text>
            <Feather name="chevron-down" size={12} color={Colors.dark.textTertiary} />
          </Pressable>
          {showSortMenu ? (
            <View style={styles.sortMenu}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.sortOption, sortMode === opt.key ? styles.sortOptionActive : null]}
                  onPress={() => { setSortMode(opt.key); setShowSortMenu(false); }}
                  testID={`sort-${opt.key}`}
                >
                  <Feather name={opt.icon} size={12} color={sortMode === opt.key ? Colors.dark.primary : Colors.dark.textSecondary} />
                  <Text style={[styles.sortOptionText, sortMode === opt.key ? styles.sortOptionTextActive : null]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={sortedMemories}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MemoryCard item={item} onRateImportance={handleRateImportance} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </>
  );

  const renderFileView = () => {
    if (activeFileTab === 'memory_md') {
      return (
        <MemoryFileEditor
          fileName="MEMORY.md"
          content={memoryMdFile?.content || ''}
          isEditing={isEditingMemoryMd}
          onToggleEdit={() => setIsEditingMemoryMd(!isEditingMemoryMd)}
          onSave={(content) => saveFileMutation.mutate({ fileType: 'memory_md', content })}
          lastModified={memoryMdFile?.lastModified || null}
        />
      );
    }
    if (activeFileTab === 'user_md') {
      return (
        <MemoryFileEditor
          fileName="USER.md"
          content={userMdFile?.content || ''}
          isEditing={isEditingUserMd}
          onToggleEdit={() => setIsEditingUserMd(!isEditingUserMd)}
          onSave={(content) => saveFileMutation.mutate({ fileType: 'user_md', content })}
          lastModified={userMdFile?.lastModified || null}
        />
      );
    }
    if (activeFileTab === 'daily_logs') {
      return <DailyLogsView logs={dailyLogs} />;
    }
    return null;
  };

  return (
    <View style={styles.container} testID="screen-memory-feed">
      <View style={[styles.headerArea, { marginTop: headerHeight + Spacing.sm }]}>
        <SyncStatusBar
          lastSyncTime={lastSyncTime}
          isSyncing={syncMutation.isPending}
          onSync={handleSync}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fileTabsContent}
          style={styles.fileTabs}
        >
          {FILE_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.fileTab, activeFileTab === tab.key ? styles.fileTabActive : null]}
              onPress={() => setActiveFileTab(tab.key)}
              testID={`tab-${tab.key}`}
            >
              <Feather
                name={tab.icon}
                size={14}
                color={activeFileTab === tab.key ? Colors.dark.primary : Colors.dark.textSecondary}
              />
              <Text style={[styles.fileTabText, activeFileTab === tab.key ? styles.fileTabTextActive : null]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {activeFileTab === 'timeline' ? renderTimelineView() : (
        <View style={[styles.fileViewContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
          {renderFileView()}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerArea: {
    paddingBottom: Spacing.xs,
  },
  syncBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    ...Glass.card,
    borderRadius: BorderRadius.sm,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.button,
    backgroundColor: 'rgba(155,92,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.2)',
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  fileTabs: {
    marginBottom: Spacing.xs,
  },
  fileTabsContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  fileTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  fileTabActive: {
    backgroundColor: 'rgba(155,92,255,0.12)',
    borderColor: 'rgba(155,92,255,0.3)',
  },
  fileTabText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: '500',
  },
  fileTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  timelineToolbar: {
    paddingBottom: Spacing.xs,
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
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sortLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  sortMenu: {
    flexDirection: 'row',
    marginLeft: Spacing.sm,
    gap: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sortOptionActive: {
    backgroundColor: 'rgba(155,92,255,0.1)',
  },
  sortOptionText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  sortOptionTextActive: {
    color: Colors.dark.primary,
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
  fileViewContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  fileEditorContainer: {
    flex: 1,
    ...Glass.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  fileEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fileName: {
    ...Typography.small,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lastModifiedText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.button,
    backgroundColor: 'rgba(155,92,255,0.1)',
  },
  editButtonText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cancelButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.button,
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  saveButtonText: {
    ...Typography.caption,
    color: Colors.dark.success,
    fontWeight: '600',
  },
  fileEditInput: {
    flex: 1,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.small,
    fontFamily: 'monospace',
    lineHeight: 22,
  },
  filePreview: {
    flex: 1,
    padding: Spacing.md,
  },
  fileContent: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 22,
  },
  emptyFileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    gap: Spacing.md,
  },
  emptyFileTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  emptyFileText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  logsContainer: {
    flex: 1,
    paddingTop: Spacing.sm,
  },
  logEntry: {
    ...Glass.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  logDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(155,92,255,0.1)',
  },
  logDateText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  logModified: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  logContent: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
});
