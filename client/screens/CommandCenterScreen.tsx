import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';

import { useTheme } from '@/hooks/useTheme';
import { useProfile } from '@/contexts/ProfileContext';
import { apiRequest } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';

type TabKey = 'actions' | 'schedules' | 'notifications';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'actions', label: 'Quick Actions', icon: 'zap' },
  { key: 'schedules', label: 'Schedules', icon: 'clock' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
];

const NOTIFICATION_TYPES = [
  {
    icon: 'check-circle' as const,
    color: '#10b981',
    title: 'Scheduled task completed',
    desc: 'Get notified when automated tasks finish running.',
  },
  {
    icon: 'alert-triangle' as const,
    color: '#EF4444',
    title: 'Task failed - needs attention',
    desc: 'Immediate alerts when something goes wrong.',
  },
  {
    icon: 'play' as const,
    color: '#9b5cff',
    title: 'Action executed successfully',
    desc: 'Confirmation when quick actions complete.',
  },
];

export default function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('actions');
  const [showCreateAction, setShowCreateAction] = useState(false);
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionCommand, setNewActionCommand] = useState('');

  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleDesc, setNewScheduleDesc] = useState('');
  const [newScheduleCommand, setNewScheduleCommand] = useState('');
  const [newScheduleInterval, setNewScheduleInterval] = useState('60');

  const profileId = profile?.id;

  const { data: quickActions = [], isLoading: actionsLoading } = useQuery<any[]>({
    queryKey: ['/api/quick-actions', profileId],
    enabled: !!profileId,
  });

  const { data: schedulesList = [], isLoading: schedulesLoading } = useQuery<any[]>({
    queryKey: ['/api/schedules', profileId],
    enabled: !!profileId,
  });

  const runActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      setRunningActionId(actionId);
      const res = await apiRequest('POST', `/api/quick-actions/${actionId}/run`, { profileId });
      return res.json();
    },
    onSuccess: (data) => {
      setRunningActionId(null);
      setActionResult(data.result);
      setTimeout(() => setActionResult(null), 4000);
    },
    onError: () => {
      setRunningActionId(null);
      setActionResult('Failed to run action.');
      setTimeout(() => setActionResult(null), 4000);
    },
  });

  const createActionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/quick-actions', {
        profileId,
        title: newActionTitle,
        description: newActionDesc,
        command: newActionCommand,
        icon: 'zap',
        iconColor: '#9b5cff',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quick-actions', profileId] });
      setShowCreateAction(false);
      setNewActionTitle('');
      setNewActionDesc('');
      setNewActionCommand('');
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/schedules', {
        profileId,
        title: newScheduleTitle,
        description: newScheduleDesc,
        command: newScheduleCommand,
        intervalMinutes: parseInt(newScheduleInterval) || 60,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', profileId] });
      setShowCreateSchedule(false);
      setNewScheduleTitle('');
      setNewScheduleDesc('');
      setNewScheduleCommand('');
      setNewScheduleInterval('60');
    },
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest('PUT', `/api/schedules/${id}`, { profileId, isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', profileId] });
    },
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string | null>(null);

  React.useEffect(() => {
    Notifications.getPermissionsAsync().then((result) => {
      setNotifPermission(result.status);
      setNotificationsEnabled(result.status === 'granted');
    });
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifPermission(status);
    setNotificationsEnabled(status === 'granted');
  }, []);

  const renderActionCard = ({ item }: { item: any }) => {
    const isRunning = runningActionId === item.id;
    return (
      <View style={[styles.actionCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]} testID={`card-action-${item.id}`}>
        <View style={[styles.actionIconWrap, { backgroundColor: `${item.iconColor}20` }]}>
          <Feather name={item.icon as any} size={22} color={item.iconColor} />
        </View>
        <Text style={[styles.actionTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.actionDesc, { color: theme.textSecondary }]} numberOfLines={2}>{item.description}</Text>
        <Pressable
          style={[styles.runButton, isRunning ? styles.runButtonDisabled : null]}
          onPress={() => runActionMutation.mutate(item.id)}
          disabled={isRunning}
          testID={`button-run-${item.id}`}
        >
          {isRunning ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <>
              <Feather name="play" size={14} color={Colors.dark.primary} />
              <Text style={styles.runButtonText}>Run</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  const renderScheduleItem = ({ item }: { item: any }) => (
    <View style={[styles.scheduleItem, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]} testID={`card-schedule-${item.id}`}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.scheduleTitle, { color: theme.text }]}>{item.title}</Text>
        {item.description ? (
          <Text style={[styles.scheduleDesc, { color: theme.textSecondary }]}>{item.description}</Text>
        ) : null}
        <Text style={[styles.scheduleInterval, { color: theme.textTertiary }]}>
          Every {item.intervalMinutes} min
        </Text>
      </View>
      <Pressable
        onPress={() => toggleScheduleMutation.mutate({ id: item.id, isActive: !item.isActive })}
        style={[styles.toggleButton, item.isActive ? styles.toggleActive : styles.toggleInactive]}
        testID={`button-toggle-schedule-${item.id}`}
      >
        <Text style={[styles.toggleText, { color: item.isActive ? '#10b981' : theme.textTertiary }]}>
          {item.isActive ? 'Active' : 'Paused'}
        </Text>
      </Pressable>
    </View>
  );

  const renderQuickActionsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
        <Pressable
          style={styles.createButton}
          onPress={() => setShowCreateAction(true)}
          testID="button-create-action"
        >
          <Feather name="plus" size={16} color={Colors.dark.primary} />
          <Text style={styles.createButtonText}>Create</Text>
        </Pressable>
      </View>

      {actionResult ? (
        <View style={[styles.resultBanner, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.3)' }]}>
          <Feather name="check-circle" size={16} color="#10b981" />
          <Text style={[styles.resultText, { color: '#10b981' }]} numberOfLines={3}>{actionResult}</Text>
        </View>
      ) : null}

      {actionsLoading ? (
        <ActivityIndicator size="large" color={Colors.dark.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={quickActions}
          renderItem={renderActionCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.actionRow}
          contentContainerStyle={styles.actionsList}
          scrollEnabled={false}
        />
      )}
    </View>
  );

  const renderSchedulesTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Automations</Text>
        <Pressable
          style={styles.createButton}
          onPress={() => setShowCreateSchedule(true)}
          testID="button-create-schedule"
        >
          <Feather name="plus" size={16} color={Colors.dark.primary} />
          <Text style={styles.createButtonText}>Create</Text>
        </Pressable>
      </View>

      {schedulesLoading ? (
        <ActivityIndicator size="large" color={Colors.dark.primary} style={{ marginTop: 40 }} />
      ) : schedulesList.length > 0 ? (
        <FlatList
          data={schedulesList}
          renderItem={renderScheduleItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scheduleList}
          scrollEnabled={false}
        />
      ) : (
        <View style={[styles.emptyState, { borderColor: theme.border }]}>
          <Feather name="clock" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No schedules yet. Create one to automate tasks.
          </Text>
        </View>
      )}
    </View>
  );

  const renderNotificationsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Push Notifications</Text>
      </View>

      <View style={[styles.notifStatusCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Feather
          name={notificationsEnabled ? 'bell' : 'bell-off'}
          size={28}
          color={notificationsEnabled ? '#10b981' : theme.textTertiary}
        />
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={[styles.notifStatusTitle, { color: theme.text }]}>
            {notificationsEnabled ? 'Notifications Enabled' : 'Notifications Disabled'}
          </Text>
          <Text style={[styles.notifStatusDesc, { color: theme.textSecondary }]}>
            {notificationsEnabled
              ? 'You will receive notifications about task results.'
              : 'Enable to get notified about task results.'}
          </Text>
        </View>
        {!notificationsEnabled ? (
          <Pressable
            style={styles.enableButton}
            onPress={handleEnableNotifications}
            testID="button-enable-notifications"
          >
            <Feather name="bell" size={14} color="#FFF" />
            <Text style={styles.enableButtonText}>Enable Notifications</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.notifSectionLabel, { color: theme.textSecondary }]}>
        What you'll be notified about
      </Text>

      {NOTIFICATION_TYPES.map((notif, idx) => (
        <View
          key={idx}
          style={[styles.notifTypeRow, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
        >
          <View style={[styles.notifTypeIcon, { backgroundColor: `${notif.color}20` }]}>
            <Feather name={notif.icon} size={20} color={notif.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.notifTypeTitle, { color: theme.text }]}>{notif.title}</Text>
            <Text style={[styles.notifTypeDesc, { color: theme.textSecondary }]}>{notif.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderCreateActionModal = () => (
    <Modal visible={showCreateAction} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Quick Action</Text>
            <Pressable onPress={() => setShowCreateAction(false)} testID="button-close-create-action">
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Action name"
            placeholderTextColor={theme.textPlaceholder}
            value={newActionTitle}
            onChangeText={setNewActionTitle}
            testID="input-action-title"
          />
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Description"
            placeholderTextColor={theme.textPlaceholder}
            value={newActionDesc}
            onChangeText={setNewActionDesc}
            testID="input-action-desc"
          />
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Command (e.g. check_weather)"
            placeholderTextColor={theme.textPlaceholder}
            value={newActionCommand}
            onChangeText={setNewActionCommand}
            testID="input-action-command"
          />
          <Pressable
            style={[styles.modalSubmit, (!newActionTitle || !newActionCommand) ? { opacity: 0.5 } : null]}
            onPress={() => createActionMutation.mutate()}
            disabled={!newActionTitle || !newActionCommand || createActionMutation.isPending}
            testID="button-submit-action"
          >
            {createActionMutation.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.modalSubmitText}>Create Action</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderCreateScheduleModal = () => (
    <Modal visible={showCreateSchedule} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Automation</Text>
            <Pressable onPress={() => setShowCreateSchedule(false)} testID="button-close-create-schedule">
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Schedule name"
            placeholderTextColor={theme.textPlaceholder}
            value={newScheduleTitle}
            onChangeText={setNewScheduleTitle}
            testID="input-schedule-title"
          />
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Description (optional)"
            placeholderTextColor={theme.textPlaceholder}
            value={newScheduleDesc}
            onChangeText={setNewScheduleDesc}
            testID="input-schedule-desc"
          />
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Command to run"
            placeholderTextColor={theme.textPlaceholder}
            value={newScheduleCommand}
            onChangeText={setNewScheduleCommand}
            testID="input-schedule-command"
          />
          <TextInput
            style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            placeholder="Interval (minutes)"
            placeholderTextColor={theme.textPlaceholder}
            value={newScheduleInterval}
            onChangeText={setNewScheduleInterval}
            keyboardType="number-pad"
            testID="input-schedule-interval"
          />
          <Pressable
            style={[styles.modalSubmit, (!newScheduleTitle || !newScheduleCommand) ? { opacity: 0.5 } : null]}
            onPress={() => createScheduleMutation.mutate()}
            disabled={!newScheduleTitle || !newScheduleCommand || createScheduleMutation.isPending}
            testID="button-submit-schedule"
          >
            {createScheduleMutation.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.modalSubmitText}>Create Schedule</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={[1]}
        renderItem={() => (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <View style={styles.tabBar}>
              {TABS.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[
                    styles.tab,
                    activeTab === tab.key ? styles.tabActive : null,
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                  testID={`tab-${tab.key}`}
                >
                  <Feather
                    name={tab.icon as any}
                    size={14}
                    color={activeTab === tab.key ? '#FFF' : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: activeTab === tab.key ? '#FFF' : theme.textSecondary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {activeTab === 'actions' ? renderQuickActionsTab() : null}
            {activeTab === 'schedules' ? renderSchedulesTab() : null}
            {activeTab === 'notifications' ? renderNotificationsTab() : null}
          </View>
        )}
        keyExtractor={() => 'content'}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      />

      {renderCreateActionModal()}
      {renderCreateScheduleModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: {
    backgroundColor: 'rgba(155,92,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.5)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h3,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  createButtonText: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  resultText: {
    flex: 1,
    fontSize: 13,
  },
  actionRow: {
    gap: Spacing.md,
  },
  actionsList: {
    gap: Spacing.md,
  },
  actionCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing.sm,
    flex: 1,
  },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(155,92,255,0.15)',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  runButtonDisabled: {
    opacity: 0.5,
  },
  runButtonText: {
    color: Colors.dark.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleList: {
    gap: Spacing.md,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  scheduleTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  scheduleDesc: {
    fontSize: 12,
    marginBottom: 2,
  },
  scheduleInterval: {
    fontSize: 11,
  },
  toggleButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  toggleActive: {
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  toggleInactive: {
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.xl,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  notifStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  notifStatusTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  notifStatusDesc: {
    fontSize: 12,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  enableButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  notifSectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: Spacing.md,
  },
  notifTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  notifTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTypeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  notifTypeDesc: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    ...Typography.h4,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: 15,
    marginBottom: Spacing.md,
  },
  modalSubmit: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  modalSubmitText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
