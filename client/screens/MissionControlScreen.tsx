import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/query-client';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

interface EmergencyStop {
  id: string;
  profileId: string;
  reason: string;
  stoppedProcesses: string | null;
  status: string;
  triggeredAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

interface Schedule {
  id: string;
  title: string;
  command: string;
  isActive: boolean;
  lastRunAt: string | null;
}

export default function MissionControlScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profileId } = useProfile();
  const queryClient = useQueryClient();
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopReason, setStopReason] = useState('');

  const { data: stops = [], isLoading: stopsLoading, refetch, isRefetching } = useQuery<EmergencyStop[]>({
    queryKey: ['/api/emergency-stops', profileId],
    enabled: !!profileId,
  });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ['/api/schedules', profileId],
    enabled: !!profileId,
  });

  const activeStops = stops.filter(s => s.status === 'triggered');
  const activeSchedules = schedules.filter(s => s.isActive);

  const triggerStopMutation = useMutation({
    mutationFn: async (reason: string) => {
      await apiRequest('POST', '/api/emergency-stop', { profileId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/emergency-stops'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules'] });
      setShowStopModal(false);
      setStopReason('');
    },
  });

  const resolveStopMutation = useMutation({
    mutationFn: async (stopId: string) => {
      await apiRequest('PUT', `/api/emergency-stop/${stopId}/resolve`, { profileId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/emergency-stops'] });
    },
  });

  const handleTriggerStop = () => {
    if (!stopReason.trim()) return;
    triggerStopMutation.mutate(stopReason.trim());
  };

  if (stopsLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="screen-mission-control">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={[styles.emergencyButton, activeStops.length > 0 ? styles.emergencyButtonActive : null]}
          onPress={() => setShowStopModal(true)}
          testID="button-emergency-stop"
        >
          <View style={styles.emergencyIconWrap}>
            <Feather name="alert-octagon" size={32} color="#fff" />
          </View>
          <Text style={styles.emergencyText}>EMERGENCY STOP</Text>
          <Text style={styles.emergencySubtext}>
            {activeStops.length > 0
              ? `${activeStops.length} active stop${activeStops.length > 1 ? 's' : ''}`
              : 'Stop all running processes'}
          </Text>
        </Pressable>

        {activeStops.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Active Stops</Text>
            {activeStops.map((stop) => (
              <View key={stop.id} style={styles.activeStopCard} testID={`stop-active-${stop.id}`}>
                <View style={styles.stopHeader}>
                  <Feather name="alert-triangle" size={18} color={Colors.dark.error} />
                  <Text style={styles.stopReason}>{stop.reason}</Text>
                </View>
                <Text style={styles.stopMeta}>
                  Triggered {new Date(stop.triggeredAt).toLocaleString()}
                </Text>
                {stop.stoppedProcesses ? (
                  <Text style={styles.stopProcesses}>{stop.stoppedProcesses}</Text>
                ) : null}
                <Pressable
                  style={styles.resolveButton}
                  onPress={() => resolveStopMutation.mutate(stop.id)}
                  disabled={resolveStopMutation.isPending}
                  testID={`button-resolve-${stop.id}`}
                >
                  {resolveStopMutation.isPending ? (
                    <ActivityIndicator size="small" color="#10b981" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={16} color="#10b981" />
                      <Text style={styles.resolveText}>Resolve</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>
          Active Processes ({activeSchedules.length})
        </Text>
        {activeSchedules.length > 0 ? activeSchedules.map((schedule) => (
          <View key={schedule.id} style={styles.processCard} testID={`process-${schedule.id}`}>
            <View style={styles.processHeader}>
              <View style={styles.processStatusDot} />
              <Text style={styles.processTitle}>{schedule.title}</Text>
            </View>
            <Text style={styles.processCommand}>{schedule.command}</Text>
            {schedule.lastRunAt ? (
              <Text style={styles.processMeta}>Last run: {new Date(schedule.lastRunAt).toLocaleString()}</Text>
            ) : null}
          </View>
        )) : (
          <View style={styles.noProcessCard}>
            <Feather name="check-circle" size={20} color={Colors.dark.textTertiary} />
            <Text style={styles.noProcessText}>No active processes</Text>
          </View>
        )}

        {stops.filter(s => s.status === 'resolved').length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Stop History</Text>
            {stops.filter(s => s.status === 'resolved').slice(0, 10).map((stop) => (
              <View key={stop.id} style={styles.historyCard} testID={`stop-history-${stop.id}`}>
                <View style={styles.historyHeader}>
                  <Feather name="check" size={14} color={Colors.dark.textTertiary} />
                  <Text style={styles.historyReason}>{stop.reason}</Text>
                </View>
                <Text style={styles.historyMeta}>
                  {new Date(stop.triggeredAt).toLocaleDateString()} - Resolved {stop.resolvedAt ? new Date(stop.resolvedAt).toLocaleTimeString() : ''}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={showStopModal} transparent animationType="fade" testID="modal-emergency-stop">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Feather name="alert-octagon" size={24} color={Colors.dark.error} />
              <Text style={styles.modalTitle}>Emergency Stop</Text>
            </View>
            <Text style={styles.modalDescription}>
              This will immediately stop all active schedules and send a kill signal to your OpenClaw Gateway.
            </Text>

            <Text style={styles.modalLabel}>Reason</Text>
            <TextInput
              style={styles.modalInput}
              value={stopReason}
              onChangeText={setStopReason}
              placeholder="Why are you triggering the emergency stop?"
              placeholderTextColor={Colors.dark.textPlaceholder}
              multiline
              testID="input-stop-reason"
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => { setShowStopModal(false); setStopReason(''); }}
                testID="button-cancel-stop"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, !stopReason.trim() ? styles.confirmDisabled : null]}
                onPress={handleTriggerStop}
                disabled={!stopReason.trim() || triggerStopMutation.isPending}
                testID="button-confirm-stop"
              >
                {triggerStopMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmText}>Trigger Stop</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  emergencyButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: BorderRadius.xl,
    padding: Spacing['2xl'],
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emergencyButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: Colors.dark.error,
  },
  emergencyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emergencyText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.dark.error,
    letterSpacing: 2,
  },
  emergencySubtext: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  activeStopCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  stopReason: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.text,
    flex: 1,
  },
  stopMeta: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginBottom: Spacing.xs,
  },
  stopProcesses: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  resolveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  resolveText: {
    ...Typography.small,
    fontWeight: '600',
    color: '#10b981',
  },
  processCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  processHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  processStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  processTitle: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  processCommand: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    fontFamily: 'monospace',
  },
  processMeta: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginTop: Spacing.xs,
  },
  noProcessCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  noProcessText: {
    ...Typography.small,
    color: Colors.dark.textTertiary,
  },
  historyCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  historyReason: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  historyMeta: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h4,
    color: Colors.dark.error,
  },
  modalDescription: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  modalLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    fontSize: 15,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  cancelText: {
    ...Typography.button,
    color: Colors.dark.textSecondary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
    alignItems: 'center',
  },
  confirmDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    ...Typography.button,
    color: '#fff',
  },
});
