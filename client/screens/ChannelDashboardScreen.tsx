import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { apiRequest } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

type ChannelType = 'whatsapp' | 'telegram' | 'slack' | 'discord' | 'signal' | 'imessage' | 'email' | 'sms';

interface ChannelConnection {
  id: string;
  profileId: string;
  channelType: ChannelType;
  channelName: string;
  isActive: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  connectedAt: string;
  config?: string;
}

interface ChannelStats {
  totalChannels: number;
  activeChannels: number;
  totalMessages: number;
}

const CHANNEL_CONFIG: Record<ChannelType, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  whatsapp: { icon: 'message-circle', color: '#25D366', label: 'WhatsApp' },
  telegram: { icon: 'send', color: '#0088cc', label: 'Telegram' },
  slack: { icon: 'hash', color: '#4A154B', label: 'Slack' },
  discord: { icon: 'headphones', color: '#5865F2', label: 'Discord' },
  signal: { icon: 'shield', color: '#3A76F0', label: 'Signal' },
  imessage: { icon: 'message-square', color: '#34C759', label: 'iMessage' },
  email: { icon: 'mail', color: '#EA4335', label: 'Email' },
  sms: { icon: 'smartphone', color: '#FF9500', label: 'SMS' },
};

const ALL_CHANNEL_TYPES: ChannelType[] = ['whatsapp', 'telegram', 'slack', 'discord', 'signal', 'imessage', 'email', 'sms'];
const LIVE_CHANNELS: ChannelType[] = ['telegram'];

function StatsSummary({ stats }: { stats: ChannelStats }) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(155,92,255,0.12)' }]}>
          <Feather name="radio" size={20} color="#9b5cff" />
        </View>
        <Text style={styles.statValue} testID="text-total-channels">{stats.totalChannels}</Text>
        <Text style={styles.statLabel}>Total</Text>
      </View>
      <View style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
          <Feather name="check-circle" size={20} color="#10b981" />
        </View>
        <Text style={styles.statValue} testID="text-active-channels">{stats.activeChannels}</Text>
        <Text style={styles.statLabel}>Active</Text>
      </View>
      <View style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: 'rgba(34,211,238,0.12)' }]}>
          <Feather name="message-circle" size={20} color="#22d3ee" />
        </View>
        <Text style={styles.statValue} testID="text-total-messages">{stats.totalMessages}</Text>
        <Text style={styles.statLabel}>Messages</Text>
      </View>
    </View>
  );
}

function ChannelCard({
  channelType,
  connection,
  onConnect,
  onDisconnect,
  onToggle,
}: {
  channelType: ChannelType;
  connection: ChannelConnection | undefined;
  onConnect: (type: ChannelType) => void;
  onDisconnect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const cfg = CHANNEL_CONFIG[channelType];
  const isConnected = !!connection;
  const isActive = connection?.isActive ?? false;
  const isLive = LIVE_CHANNELS.includes(channelType);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <View
      style={[
        styles.channelCard,
        isActive ? styles.channelCardActive : null,
        !isLive ? styles.channelCardDimmed : null,
      ]}
      testID={`card-channel-${channelType}`}
    >
      <View style={styles.channelHeader}>
        <View style={[styles.channelIconWrap, { backgroundColor: `${cfg.color}20` }]}>
          <Feather name={cfg.icon} size={22} color={isLive ? cfg.color : Colors.dark.textTertiary} />
        </View>
        <View style={styles.channelStatusRow}>
          {isLive ? (
            <View style={[styles.liveBadge]}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          ) : null}
          <View style={[styles.dot, { backgroundColor: isActive ? '#10b981' : isConnected ? '#F59E0B' : Colors.dark.textTertiary }]} />
        </View>
      </View>

      <Text style={[styles.channelName, !isLive && styles.channelNameDimmed]}>{cfg.label}</Text>

      {isConnected ? (
        <>
          <Text style={styles.channelMeta} numberOfLines={1}>
            {connection.channelName !== cfg.label ? connection.channelName : `${connection.messageCount} messages`}
          </Text>
          <Text style={styles.channelActivity}>
            {formatTime(connection.lastMessageAt)}
          </Text>

          <View style={styles.channelActions}>
            <Pressable
              style={[styles.channelToggle, isActive ? styles.channelToggleActive : styles.channelToggleInactive]}
              onPress={() => onToggle(connection.id)}
              testID={`button-toggle-${channelType}`}
            >
              <Feather
                name={isActive ? 'pause' : 'play'}
                size={14}
                color={isActive ? '#F59E0B' : '#10b981'}
              />
            </Pressable>
            <Pressable
              style={styles.channelDisconnect}
              onPress={() => onDisconnect(connection.id)}
              testID={`button-disconnect-${channelType}`}
            >
              <Feather name="x" size={14} color={Colors.dark.error} />
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          style={[styles.connectButton, !isLive && styles.connectButtonDimmed]}
          onPress={() => isLive ? onConnect(channelType) : undefined}
          testID={`button-connect-${channelType}`}
        >
          <Feather name={isLive ? 'plus' : 'clock'} size={14} color={isLive ? Colors.dark.primary : Colors.dark.textTertiary} />
          <Text style={[styles.connectText, !isLive && styles.connectTextDimmed]}>
            {isLive ? 'Connect' : 'Coming soon'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function TelegramSetupModal({
  visible,
  onClose,
  onSetup,
  isLoading,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSetup: (token: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [token, setToken] = useState('');
  const insets = useSafeAreaInsets();

  const handleSubmit = () => {
    if (token.trim()) onSetup(token.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.modalHandle} />

          <View style={[styles.telegramIconWrap, { backgroundColor: '#0088cc20' }]}>
            <Feather name="send" size={28} color="#0088cc" />
          </View>

          <Text style={styles.modalTitle}>Connect Telegram Bot</Text>
          <Text style={styles.modalSubtitle}>
            Your agent will receive messages from Telegram and reply automatically.
          </Text>

          <View style={styles.stepBox}>
            <Text style={styles.stepTitle}>How to get a bot token:</Text>
            <Text style={styles.stepText}>1. Open Telegram and search for <Text style={styles.stepHighlight}>@BotFather</Text></Text>
            <Text style={styles.stepText}>2. Send the command <Text style={styles.stepHighlight}>/newbot</Text></Text>
            <Text style={styles.stepText}>3. Follow the prompts, then copy the token it gives you</Text>
          </View>

          <Text style={styles.inputLabel}>Bot Token</Text>
          <TextInput
            style={styles.tokenInput}
            placeholder="1234567890:ABCDef..."
            placeholderTextColor={Colors.dark.textTertiary}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
            testID="input-telegram-token"
          />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <Pressable
            style={[styles.setupButton, (!token.trim() || isLoading) && styles.setupButtonDisabled]}
            onPress={handleSubmit}
            disabled={!token.trim() || isLoading}
            testID="button-telegram-setup"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.setupButtonText}>Connect Bot</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onClose} testID="button-telegram-cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="radio" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Channels Connected</Text>
      <Text style={styles.emptyText}>
        Connect messaging platforms to let your agent communicate across multiple channels.
      </Text>
    </View>
  );
}

export default function ChannelDashboardScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const profileId = profile?.id;
  const queryClient = useQueryClient();

  const [telegramModalVisible, setTelegramModalVisible] = useState(false);
  const [telegramSetupError, setTelegramSetupError] = useState<string | null>(null);

  const { data: channels = [], isLoading, refetch, isRefetching } = useQuery<ChannelConnection[]>({
    queryKey: ['/api/channels', profileId],
    enabled: !!profileId,
  });

  const { data: statsData } = useQuery<ChannelStats>({
    queryKey: ['/api/channels', profileId, 'stats'],
    enabled: !!profileId,
  });

  const stats: ChannelStats = statsData || {
    totalChannels: channels.length,
    activeChannels: channels.filter(c => c.isActive).length,
    totalMessages: channels.reduce((sum, c) => sum + c.messageCount, 0),
  };

  const telegramSetupMutation = useMutation({
    mutationFn: async (botToken: string) => {
      return await apiRequest('POST', '/api/channels/telegram/setup', { botToken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', profileId] });
      queryClient.invalidateQueries({ queryKey: ['/api/channels', profileId, 'stats'] });
      setTelegramModalVisible(false);
      setTelegramSetupError(null);
    },
    onError: (err: any) => {
      setTelegramSetupError(err?.message || 'Failed to connect. Check your token and try again.');
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/channels/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', profileId] });
      queryClient.invalidateQueries({ queryKey: ['/api/channels', profileId, 'stats'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('PUT', `/api/channels/${id}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', profileId] });
      queryClient.invalidateQueries({ queryKey: ['/api/channels', profileId, 'stats'] });
    },
  });

  const channelMap = new Map<ChannelType, ChannelConnection>();
  channels.forEach(c => channelMap.set(c.channelType as ChannelType, c));

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleConnect = (type: ChannelType) => {
    if (type === 'telegram') {
      setTelegramSetupError(null);
      setTelegramModalVisible(true);
    }
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
        }
        testID="screen-channel-dashboard"
      >
        <StatsSummary stats={stats} />

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : (
          <>
            {channels.length === 0 ? <EmptyState /> : null}

            <Text style={styles.sectionTitle}>Channels</Text>

            <View style={styles.channelGrid}>
              {ALL_CHANNEL_TYPES.map(type => (
                <ChannelCard
                  key={type}
                  channelType={type}
                  connection={channelMap.get(type)}
                  onConnect={handleConnect}
                  onDisconnect={(id) => disconnectMutation.mutate(id)}
                  onToggle={(id) => toggleMutation.mutate(id)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <TelegramSetupModal
        visible={telegramModalVisible}
        onClose={() => setTelegramModalVisible(false)}
        onSetup={(token) => telegramSetupMutation.mutate(token)}
        isLoading={telegramSetupMutation.isPending}
        error={telegramSetupError}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  channelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  channelCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexGrow: 1,
    flexBasis: '45%',
    gap: Spacing.xs,
  },
  channelCardActive: {
    borderColor: 'rgba(16,185,129,0.25)',
  },
  channelCardDimmed: {
    opacity: 0.5,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  channelIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  channelName: {
    ...Typography.small,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  channelNameDimmed: {
    color: Colors.dark.textTertiary,
  },
  channelMeta: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  channelActivity: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    fontSize: 11,
  },
  channelActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  channelToggle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelToggleActive: {
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  channelToggleInactive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  channelDisconnect: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(239,68,68,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(155,92,255,0.1)',
    alignSelf: 'flex-start',
  },
  connectButtonDimmed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  connectText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  connectTextDimmed: {
    color: Colors.dark.textTertiary,
  },
  loadingContainer: {
    paddingTop: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['3xl'],
    paddingTop: Spacing.xl,
    marginBottom: Spacing.xl,
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
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    ...Glass.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: Spacing.xl,
    paddingTop: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: Spacing.sm,
  },
  telegramIconWrap: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  stepBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  stepTitle: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  stepText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    lineHeight: 18,
  },
  stepHighlight: {
    color: '#0088cc',
    fontWeight: '600',
  },
  inputLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    alignSelf: 'flex-start',
  },
  tokenInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: Colors.dark.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dark.error,
    textAlign: 'center',
  },
  setupButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#0088cc',
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
  },
  setupButtonDisabled: {
    opacity: 0.4,
  },
  setupButtonText: {
    ...Typography.body,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.dark.textTertiary,
  },
});
