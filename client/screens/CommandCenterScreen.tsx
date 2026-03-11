import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
  Switch,
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

type TabKey = 'actions' | 'schedules' | 'heartbeat' | 'history' | 'notifications';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'actions', label: 'Actions', icon: 'zap' },
  { key: 'schedules', label: 'Cron', icon: 'clock' },
  { key: 'heartbeat', label: 'Heartbeat', icon: 'heart' },
  { key: 'history', label: 'History', icon: 'list' },
  { key: 'notifications', label: 'Alerts', icon: 'bell' },
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

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney',
  'Pacific/Auckland',
];

const HEARTBEAT_INTERVALS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
];

const CRON_MINUTES = ['*', '0', '5', '10', '15', '20', '30', '45'];
const CRON_HOURS = ['*', '0', '1', '2', '3', '4', '6', '8', '12', '18'];
const CRON_DAYS_OF_MONTH = ['*', '1', '5', '10', '15', '20', '25'];
const CRON_MONTHS = ['*', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const CRON_DAYS_OF_WEEK = [
  { label: '*', value: '*' },
  { label: 'Sun', value: '0' },
  { label: 'Mon', value: '1' },
  { label: 'Tue', value: '2' },
  { label: 'Wed', value: '3' },
  { label: 'Thu', value: '4' },
  { label: 'Fri', value: '5' },
  { label: 'Sat', value: '6' },
];

const MOCK_HISTORY = [
  { id: '1', name: 'Daily backup', status: 'success', ranAt: '2025-01-15T08:00:00Z', duration: '2.3s' },
  { id: '2', name: 'Health check', status: 'success', ranAt: '2025-01-15T07:30:00Z', duration: '0.8s' },
  { id: '3', name: 'Sync data', status: 'failed', ranAt: '2025-01-15T06:00:00Z', duration: '5.1s', error: 'Connection timeout' },
  { id: '4', name: 'Clean temp files', status: 'success', ranAt: '2025-01-14T23:00:00Z', duration: '1.2s' },
  { id: '5', name: 'Generate report', status: 'running', ranAt: '2025-01-15T08:15:00Z', duration: '...' },
  { id: '6', name: 'Daily backup', status: 'success', ranAt: '2025-01-14T08:00:00Z', duration: '2.1s' },
];

function describeCron(min: string, hour: string, dom: string, month: string, dow: string): string {
  const parts: string[] = [];
  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Every minute';
  }
  if (min !== '*') parts.push(`at minute ${min}`);
  if (hour !== '*') parts.push(`at hour ${hour}`);
  if (dom !== '*') parts.push(`on day ${dom}`);
  if (month !== '*') parts.push(`in month ${month}`);
  if (dow !== '*') {
    const dayName = CRON_DAYS_OF_WEEK.find(d => d.value === dow)?.label || dow;
    parts.push(`on ${dayName}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'Every minute';
}

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

  const [cronMinute, setCronMinute] = useState('*');
  const [cronHour, setCronHour] = useState('*');
  const [cronDom, setCronDom] = useState('*');
  const [cronMonth, setCronMonth] = useState('*');
  const [cronDow, setCronDow] = useState('*');
  const [selectedTimezone, setSelectedTimezone] = useState('UTC');
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [sessionType, setSessionType] = useState<'main' | 'isolated'>('main');

  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false);
  const [heartbeatInterval, setHeartbeatInterval] = useState(30);
  const [heartbeatChecklist, setHeartbeatChecklist] = useState('- [ ] Check API health\n- [ ] Verify database connection\n- [ ] Review error logs');

  const cronExpression = useMemo(
    () => `${cronMinute} ${cronHour} ${cronDom} ${cronMonth} ${cronDow}`,
    [cronMinute, cronHour, cronDom, cronMonth, cronDow]
  );

  const cronDescription = useMemo(
    () => describeCron(cronMinute, cronHour, cronDom, cronMonth, cronDow),
    [cronMinute, cronHour, cronDom, cronMonth, cronDow]
  );

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
        cronExpression,
        timezone: selectedTimezone,
        sessionType,
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
      setCronMinute('*');
      setCronHour('*');
      setCronDom('*');
      setCronMonth('*');
      setCronDow('*');
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

  const renderCronSelector = (
    label: string,
    options: string[] | { label: string; value: string }[],
    selected: string,
    onSelect: (val: string) => void,
  ) => {
    const isObject = options.length > 0 && typeof options[0] === 'object';
    return (
      <View style={styles.cronFieldContainer}>
        <Text style={[styles.cronFieldLabel, { color: theme.textSecondary }]}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cronOptionsScroll}>
          <View style={styles.cronOptionsRow}>
            {(options as any[]).map((opt) => {
              const value = isObject ? opt.value : opt;
              const displayLabel = isObject ? opt.label : opt;
              const isSelected = selected === value;
              return (
                <Pressable
                  key={value}
                  style={[
                    styles.cronOption,
                    isSelected ? styles.cronOptionSelected : { backgroundColor: 'rgba(255,255,255,0.06)' },
                  ]}
                  onPress={() => onSelect(value)}
                  testID={`cron-${label}-${value}`}
                >
                  <Text
                    style={[
                      styles.cronOptionText,
                      { color: isSelected ? '#FFF' : theme.textSecondary },
                    ]}
                  >
                    {displayLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

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
        <View style={styles.scheduleMeta}>
          {item.cronExpression ? (
            <View style={styles.scheduleMetaBadge}>
              <Feather name="terminal" size={10} color={theme.textTertiary} />
              <Text style={[styles.scheduleMetaText, { color: theme.textTertiary }]}>{item.cronExpression}</Text>
            </View>
          ) : (
            <Text style={[styles.scheduleInterval, { color: theme.textTertiary }]}>
              Every {item.intervalMinutes} min
            </Text>
          )}
          {item.sessionType ? (
            <View style={[styles.scheduleMetaBadge, { backgroundColor: item.sessionType === 'isolated' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)' }]}>
              <Text style={[styles.scheduleMetaText, { color: item.sessionType === 'isolated' ? '#EF4444' : '#10b981' }]}>
                {item.sessionType}
              </Text>
            </View>
          ) : null}
        </View>
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
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Cron Schedules</Text>
        <Pressable
          style={styles.createButton}
          onPress={() => setShowCreateSchedule(true)}
          testID="button-create-schedule"
        >
          <Feather name="plus" size={16} color={Colors.dark.primary} />
          <Text style={styles.createButtonText}>Create</Text>
        </Pressable>
      </View>

      <View style={[styles.cronPreviewCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Text style={[styles.cronPreviewLabel, { color: theme.textSecondary }]}>Cron Builder</Text>

        {renderCronSelector('Minute', CRON_MINUTES, cronMinute, setCronMinute)}
        {renderCronSelector('Hour', CRON_HOURS, cronHour, setCronHour)}
        {renderCronSelector('Day', CRON_DAYS_OF_MONTH, cronDom, setCronDom)}
        {renderCronSelector('Month', CRON_MONTHS, cronMonth, setCronMonth)}
        {renderCronSelector('Weekday', CRON_DAYS_OF_WEEK, cronDow, setCronDow)}

        <View style={styles.cronExpressionRow}>
          <View style={[styles.cronExpressionBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Text style={[styles.cronExpressionText, { color: Colors.dark.cyan }]}>{cronExpression}</Text>
          </View>
        </View>
        <Text style={[styles.cronDescriptionText, { color: theme.textSecondary }]}>{cronDescription}</Text>

        <View style={styles.cronConfigRow}>
          <Pressable
            style={[styles.timezoneButton, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            onPress={() => setShowTimezoneModal(true)}
            testID="button-select-timezone"
          >
            <Feather name="globe" size={14} color={theme.textSecondary} />
            <Text style={[styles.timezoneText, { color: theme.text }]}>{selectedTimezone}</Text>
            <Feather name="chevron-down" size={14} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.sessionTypeRow}>
          <Text style={[styles.sessionTypeLabel, { color: theme.textSecondary }]}>Session Type</Text>
          <View style={styles.sessionToggle}>
            <Pressable
              style={[
                styles.sessionOption,
                sessionType === 'main' ? styles.sessionOptionActive : { backgroundColor: 'rgba(255,255,255,0.06)' },
              ]}
              onPress={() => setSessionType('main')}
              testID="button-session-main"
            >
              <Text style={[styles.sessionOptionText, { color: sessionType === 'main' ? '#FFF' : theme.textSecondary }]}>Main</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sessionOption,
                sessionType === 'isolated' ? styles.sessionOptionActiveIsolated : { backgroundColor: 'rgba(255,255,255,0.06)' },
              ]}
              onPress={() => setSessionType('isolated')}
              testID="button-session-isolated"
            >
              <Text style={[styles.sessionOptionText, { color: sessionType === 'isolated' ? '#FFF' : theme.textSecondary }]}>Isolated</Text>
            </Pressable>
          </View>
        </View>
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

  const renderHeartbeatTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Heartbeat</Text>
      </View>

      <View style={[styles.heartbeatCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.heartbeatHeader}>
          <View style={styles.heartbeatTitleRow}>
            <Feather name="heart" size={20} color={heartbeatEnabled ? '#EF4444' : theme.textTertiary} />
            <Text style={[styles.heartbeatTitle, { color: theme.text }]}>Heartbeat Monitor</Text>
          </View>
          <Switch
            value={heartbeatEnabled}
            onValueChange={setHeartbeatEnabled}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(239,68,68,0.4)' }}
            thumbColor={heartbeatEnabled ? '#EF4444' : '#888'}
            testID="switch-heartbeat"
          />
        </View>

        <Text style={[styles.heartbeatDesc, { color: theme.textSecondary }]}>
          Periodic health check that runs your checklist at regular intervals.
        </Text>

        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Interval</Text>
        <View style={styles.intervalRow}>
          {HEARTBEAT_INTERVALS.map((int) => (
            <Pressable
              key={int.value}
              style={[
                styles.intervalOption,
                heartbeatInterval === int.value ? styles.intervalOptionActive : { backgroundColor: 'rgba(255,255,255,0.06)' },
              ]}
              onPress={() => setHeartbeatInterval(int.value)}
              testID={`button-heartbeat-${int.value}`}
            >
              <Text
                style={[
                  styles.intervalOptionText,
                  { color: heartbeatInterval === int.value ? '#FFF' : theme.textSecondary },
                ]}
              >
                {int.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Checklist (Markdown)</Text>
        <TextInput
          style={[styles.checklistInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
          value={heartbeatChecklist}
          onChangeText={setHeartbeatChecklist}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          placeholderTextColor={theme.textPlaceholder}
          placeholder="- [ ] Check API health..."
          testID="input-heartbeat-checklist"
        />

        {heartbeatEnabled ? (
          <View style={[styles.heartbeatStatus, { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }]}>
            <Feather name="activity" size={14} color="#10b981" />
            <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '600' }}>
              Running every {HEARTBEAT_INTERVALS.find(i => i.value === heartbeatInterval)?.label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  const renderHistoryTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Execution History</Text>
      </View>

      {MOCK_HISTORY.map((job) => {
        const statusColor = job.status === 'success' ? '#10b981' : job.status === 'failed' ? '#EF4444' : '#F59E0B';
        const statusIcon = job.status === 'success' ? 'check-circle' : job.status === 'failed' ? 'x-circle' : 'loader';
        const ranDate = new Date(job.ranAt);
        const timeStr = ranDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = ranDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

        return (
          <View
            key={job.id}
            style={[styles.historyItem, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
            testID={`card-history-${job.id}`}
          >
            <View style={[styles.historyStatusDot, { backgroundColor: `${statusColor}20` }]}>
              <Feather name={statusIcon as any} size={16} color={statusColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.historyName, { color: theme.text }]}>{job.name}</Text>
              <View style={styles.historyMetaRow}>
                <Text style={[styles.historyTime, { color: theme.textTertiary }]}>{dateStr} {timeStr}</Text>
                <View style={styles.historyDot} />
                <Text style={[styles.historyDuration, { color: theme.textTertiary }]}>{job.duration}</Text>
              </View>
              {job.error ? (
                <Text style={[styles.historyError, { color: '#EF4444' }]}>{job.error}</Text>
              ) : null}
            </View>
            <View style={[styles.historyStatusBadge, { backgroundColor: `${statusColor}15`, borderColor: `${statusColor}30` }]}>
              <Text style={[styles.historyStatusText, { color: statusColor }]}>{job.status}</Text>
            </View>
          </View>
        );
      })}
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Cron Schedule</Text>
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

          <View style={[styles.cronPreviewInModal, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Text style={[styles.cronPreviewLabel, { color: theme.textSecondary }]}>Cron Expression</Text>
            <Text style={[styles.cronExpressionText, { color: Colors.dark.cyan }]}>{cronExpression}</Text>
            <Text style={[styles.cronDescriptionText, { color: theme.textTertiary, fontSize: 11, marginTop: 2 }]}>{cronDescription}</Text>
          </View>

          <View style={styles.modalMetaRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalMetaLabel, { color: theme.textSecondary }]}>Timezone</Text>
              <Text style={[styles.modalMetaValue, { color: theme.text }]}>{selectedTimezone}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalMetaLabel, { color: theme.textSecondary }]}>Session</Text>
              <Text style={[styles.modalMetaValue, { color: theme.text }]}>{sessionType}</Text>
            </View>
          </View>

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

  const renderTimezoneModal = () => (
    <Modal visible={showTimezoneModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault, maxHeight: '60%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Timezone</Text>
            <Pressable onPress={() => setShowTimezoneModal(false)} testID="button-close-timezone">
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView>
            {TIMEZONES.map((tz) => (
              <Pressable
                key={tz}
                style={[
                  styles.timezoneItem,
                  { borderColor: theme.border },
                  selectedTimezone === tz ? { backgroundColor: 'rgba(155,92,255,0.15)' } : null,
                ]}
                onPress={() => {
                  setSelectedTimezone(tz);
                  setShowTimezoneModal(false);
                }}
                testID={`tz-${tz}`}
              >
                <Text style={[styles.timezoneItemText, { color: selectedTimezone === tz ? Colors.dark.primary : theme.text }]}>
                  {tz}
                </Text>
                {selectedTimezone === tz ? (
                  <Feather name="check" size={16} color={Colors.dark.primary} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll}>
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
            </ScrollView>

            {activeTab === 'actions' ? renderQuickActionsTab() : null}
            {activeTab === 'schedules' ? renderSchedulesTab() : null}
            {activeTab === 'heartbeat' ? renderHeartbeatTab() : null}
            {activeTab === 'history' ? renderHistoryTab() : null}
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
      {renderTimezoneModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarScroll: {
    marginBottom: Spacing.xl,
  },
  tabBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
  scheduleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },
  scheduleMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  scheduleMetaText: {
    fontSize: 10,
    fontWeight: '600',
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
  cronPreviewCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  cronPreviewLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  cronFieldContainer: {
    marginBottom: Spacing.md,
  },
  cronFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cronOptionsScroll: {
    flexGrow: 0,
  },
  cronOptionsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  cronOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    minWidth: 36,
    alignItems: 'center',
  },
  cronOptionSelected: {
    backgroundColor: 'rgba(155,92,255,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.6)',
  },
  cronOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cronExpressionRow: {
    marginTop: Spacing.md,
  },
  cronExpressionBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  cronExpressionText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  cronDescriptionText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  cronConfigRow: {
    marginTop: Spacing.lg,
  },
  timezoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  timezoneText: {
    flex: 1,
    fontSize: 14,
  },
  sessionTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  sessionTypeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sessionToggle: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  sessionOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  sessionOptionActive: {
    backgroundColor: 'rgba(16,185,129,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.5)',
  },
  sessionOptionActiveIsolated: {
    backgroundColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
  },
  sessionOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  heartbeatCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  heartbeatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  heartbeatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heartbeatTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  heartbeatDesc: {
    fontSize: 13,
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  intervalOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  intervalOptionActive: {
    backgroundColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
  },
  intervalOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checklistInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: 13,
    minHeight: 120,
    marginBottom: Spacing.md,
    fontFamily: 'monospace',
  },
  heartbeatStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  historyStatusDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  historyTime: {
    fontSize: 11,
  },
  historyDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  historyDuration: {
    fontSize: 11,
  },
  historyError: {
    fontSize: 11,
    marginTop: 2,
  },
  historyStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  historyStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
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
  cronPreviewInModal: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  modalMetaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalMetaLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  modalMetaValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  timezoneItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  timezoneItemText: {
    fontSize: 15,
  },
});
