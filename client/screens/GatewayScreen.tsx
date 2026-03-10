import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';

import { useTheme } from '@/hooks/useTheme';
import { Colors, Spacing, BorderRadius, Typography, Gradients } from '@/constants/theme';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

interface SettingsData {
  openclawUrl: string;
  saveMessagesLocally: boolean;
}

interface HealthData {
  version?: string;
  uptime?: number;
  model?: string;
  status?: string;
}

export default function GatewayScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [networkType, setNetworkType] = useState<string>('Unknown');

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['/api/settings'],
  });

  const openclawUrl = settings?.openclawUrl || '';

  const checkGateway = useCallback(async () => {
    if (!openclawUrl) {
      setConnectionStatus('disconnected');
      setHealthData(null);
      setResponseTime(null);
      return;
    }

    setConnectionStatus('checking');
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${openclawUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const elapsed = Date.now() - startTime;
      setResponseTime(elapsed);
      setLastChecked(new Date());

      if (response.ok) {
        try {
          const data = await response.json();
          setHealthData(data);
        } catch {
          setHealthData({ status: 'ok' });
        }
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
        setHealthData(null);
      }
    } catch {
      setConnectionStatus('disconnected');
      setResponseTime(null);
      setHealthData(null);
      setLastChecked(new Date());
    }
  }, [openclawUrl]);

  useEffect(() => {
    checkGateway();
  }, [checkGateway]);

  useEffect(() => {
    const loadDeviceInfo = async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        setBatteryLevel(level);
      } catch {
        setBatteryLevel(null);
      }

      try {
        const netState = await NetInfo.fetch();
        setNetworkType(netState.type || 'Unknown');
      } catch {
        setNetworkType('Unknown');
      }
    };

    loadDeviceInfo();
  }, []);

  const statusColor =
    connectionStatus === 'connected'
      ? Colors.dark.success
      : connectionStatus === 'checking'
        ? Colors.dark.warning
        : Colors.dark.error;

  const statusText =
    connectionStatus === 'connected'
      ? 'Connected'
      : connectionStatus === 'checking'
        ? 'Checking...'
        : 'Disconnected';

  const statusIcon: 'check-circle' | 'loader' | 'x-circle' =
    connectionStatus === 'connected'
      ? 'check-circle'
      : connectionStatus === 'checking'
        ? 'loader'
        : 'x-circle';

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const batteryPercent =
    batteryLevel !== null ? `${Math.round(batteryLevel * 100)}%` : 'N/A';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View
        style={[
          styles.statusCard,
          { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
        ]}
      >
        <View style={styles.statusIndicatorRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]}>
            {connectionStatus === 'checking' ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name={statusIcon} size={28} color="#FFF" />
            )}
          </View>
        </View>

        <Text
          style={[styles.statusText, { color: statusColor }]}
          testID="text-gateway-status"
        >
          {statusText}
        </Text>

        {openclawUrl ? (
          <Text style={[styles.urlText, { color: theme.textSecondary }]} numberOfLines={1}>
            {openclawUrl}
          </Text>
        ) : (
          <Text style={[styles.urlText, { color: theme.textSecondary }]}>
            No Gateway URL configured
          </Text>
        )}

        {lastChecked ? (
          <Text style={[styles.timestampText, { color: theme.textTertiary }]}>
            Last checked: {lastChecked.toLocaleTimeString()}
          </Text>
        ) : null}

        <Pressable
          style={[styles.checkButton, { borderColor: Colors.dark.primary }]}
          onPress={checkGateway}
          testID="button-check-gateway"
        >
          <Feather name="refresh-cw" size={16} color={Colors.dark.primary} />
          <Text style={[styles.checkButtonText, { color: Colors.dark.primary }]}>
            Check Now
          </Text>
        </Pressable>
      </View>

      {connectionStatus === 'connected' ? (
        <View style={styles.infoCardsRow}>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: 'rgba(155,92,255,0.12)' }]}>
              <Feather name="server" size={18} color={Colors.dark.primary} />
            </View>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Server</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {healthData?.version || 'v1.0'}
            </Text>
            <Text style={[styles.infoSub, { color: theme.textTertiary }]}>
              Uptime: {formatUptime(healthData?.uptime)}
            </Text>
          </View>

          <View
            style={[
              styles.infoCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
              <Feather name="activity" size={18} color={Colors.dark.success} />
            </View>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Latency</Text>
            <Text
              style={[styles.infoValue, { color: theme.text }]}
              testID="text-response-time"
            >
              {responseTime !== null ? `${responseTime}ms` : '--'}
            </Text>
            <Text style={[styles.infoSub, { color: theme.textTertiary }]}>Round trip</Text>
          </View>

          {healthData?.model ? (
            <View
              style={[
                styles.infoCard,
                { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
              ]}
            >
              <View style={[styles.infoIconWrap, { backgroundColor: 'rgba(34,211,238,0.12)' }]}>
                <Feather name="cpu" size={18} color={Colors.dark.cyan} />
              </View>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Model</Text>
              <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
                {healthData.model}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.nodeCard,
          { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
        ]}
      >
        <View style={styles.nodeHeader}>
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nodeIconWrap}
          >
            <Feather name="smartphone" size={20} color="#FFF" />
          </LinearGradient>
          <View style={styles.nodeHeaderText}>
            <Text style={[styles.nodeTitle, { color: theme.text }]}>Device Node</Text>
            <Text style={[styles.nodeSubtitle, { color: theme.textSecondary }]}>
              OpenClaw Network
            </Text>
          </View>
          <View style={[styles.nodeBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <View style={[styles.nodeBadgeDot, { backgroundColor: Colors.dark.success }]} />
            <Text style={[styles.nodeBadgeText, { color: Colors.dark.success }]}>Online</Text>
          </View>
        </View>

        <View style={styles.nodeGrid}>
          <View style={styles.nodeRow}>
            <Feather name="monitor" size={16} color={theme.textSecondary} />
            <Text style={[styles.nodeLabel, { color: theme.textSecondary }]}>Device</Text>
            <Text
              style={[styles.nodeValue, { color: theme.text }]}
              testID="text-device-name"
              numberOfLines={1}
            >
              {Device.modelName || 'Unknown Device'}
            </Text>
          </View>

          <View style={styles.nodeRow}>
            <Feather name="layers" size={16} color={theme.textSecondary} />
            <Text style={[styles.nodeLabel, { color: theme.textSecondary }]}>Platform</Text>
            <Text style={[styles.nodeValue, { color: theme.text }]}>
              {Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)}
            </Text>
          </View>

          <View style={styles.nodeRow}>
            <Feather name="battery-charging" size={16} color={theme.textSecondary} />
            <Text style={[styles.nodeLabel, { color: theme.textSecondary }]}>Battery</Text>
            <Text style={[styles.nodeValue, { color: theme.text }]}>{batteryPercent}</Text>
          </View>

          <View style={styles.nodeRow}>
            <Feather name="wifi" size={16} color={theme.textSecondary} />
            <Text style={[styles.nodeLabel, { color: theme.textSecondary }]}>Network</Text>
            <Text style={[styles.nodeValue, { color: theme.text }]}>
              {networkType.charAt(0).toUpperCase() + networkType.slice(1)}
            </Text>
          </View>

          <View style={styles.nodeRow}>
            <Feather name="map-pin" size={16} color={theme.textSecondary} />
            <Text style={[styles.nodeLabel, { color: theme.textSecondary }]}>Location</Text>
            <Text style={[styles.nodeValue, { color: theme.text }]}>Available</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={[
            styles.actionButton,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Feather name="settings" size={20} color={Colors.dark.primary} />
          <Text style={[styles.actionLabel, { color: theme.text }]}>Settings</Text>
        </Pressable>

        <Pressable
          style={[
            styles.actionButton,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
          onPress={() => navigation.navigate('Chat', {})}
        >
          <Feather name="message-circle" size={20} color={Colors.dark.primary} />
          <Text style={[styles.actionLabel, { color: theme.text }]}>Chat</Text>
        </Pressable>

        <Pressable
          style={[
            styles.actionButton,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
          onPress={() => navigation.navigate('CommandCenter')}
        >
          <Feather name="layout" size={20} color={Colors.dark.primary} />
          <Text style={[styles.actionLabel, { color: theme.text }]}>Canvas</Text>
        </Pressable>
      </View>

      <Text style={[styles.bridgeSectionTitle, { color: theme.textSecondary }]}>
        ClawBridge
      </Text>

      <View style={styles.bridgeGrid}>
        <Pressable
          style={[styles.bridgeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
          onPress={() => navigation.navigate('LiveThoughts')}
          testID="button-live-thoughts"
        >
          <View style={[styles.bridgeIconWrap, { backgroundColor: 'rgba(155,92,255,0.12)' }]}>
            <Feather name="activity" size={22} color="#9b5cff" />
          </View>
          <Text style={[styles.bridgeCardTitle, { color: theme.text }]}>Live Thoughts</Text>
          <Text style={[styles.bridgeCardDesc, { color: theme.textTertiary }]}>
            Agent chain of thought
          </Text>
        </Pressable>

        <Pressable
          style={[styles.bridgeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
          onPress={() => navigation.navigate('TokenCosts')}
          testID="button-token-costs"
        >
          <View style={[styles.bridgeIconWrap, { backgroundColor: 'rgba(34,211,238,0.12)' }]}>
            <Feather name="dollar-sign" size={22} color="#22d3ee" />
          </View>
          <Text style={[styles.bridgeCardTitle, { color: theme.text }]}>Token Costs</Text>
          <Text style={[styles.bridgeCardDesc, { color: theme.textTertiary }]}>
            API spend by model
          </Text>
        </Pressable>

        <Pressable
          style={[styles.bridgeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
          onPress={() => navigation.navigate('SystemMetrics')}
          testID="button-system-metrics"
        >
          <View style={[styles.bridgeIconWrap, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
            <Feather name="cpu" size={22} color="#10b981" />
          </View>
          <Text style={[styles.bridgeCardTitle, { color: theme.text }]}>System Metrics</Text>
          <Text style={[styles.bridgeCardDesc, { color: theme.textTertiary }]}>
            Server resource usage
          </Text>
        </Pressable>

        <Pressable
          style={[styles.bridgeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
          onPress={() => navigation.navigate('MissionControl')}
          testID="button-mission-control"
        >
          <View style={[styles.bridgeIconWrap, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
            <Feather name="alert-octagon" size={22} color="#EF4444" />
          </View>
          <Text style={[styles.bridgeCardTitle, { color: theme.text }]}>Mission Control</Text>
          <Text style={[styles.bridgeCardDesc, { color: theme.textTertiary }]}>
            Emergency stop switch
          </Text>
        </Pressable>

        <Pressable
          style={[styles.bridgeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
          onPress={() => navigation.navigate('MemoryFeed')}
          testID="button-memory-feed"
        >
          <View style={[styles.bridgeIconWrap, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
            <Feather name="book" size={22} color="#F59E0B" />
          </View>
          <Text style={[styles.bridgeCardTitle, { color: theme.text }]}>Memory Feed</Text>
          <Text style={[styles.bridgeCardDesc, { color: theme.textTertiary }]}>
            Agent journal timeline
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing['2xl'],
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  statusIndicatorRow: {
    marginBottom: Spacing.lg,
  },
  statusDot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  urlText: {
    ...Typography.small,
    marginBottom: Spacing.xs,
  },
  timestampText: {
    ...Typography.caption,
    marginBottom: Spacing.lg,
  },
  checkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  checkButtonText: {
    ...Typography.button,
    fontSize: 14,
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  infoCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xs,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  infoLabel: {
    ...Typography.caption,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoSub: {
    ...Typography.caption,
    fontSize: 11,
  },
  nodeCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  nodeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  nodeHeaderText: {
    flex: 1,
  },
  nodeTitle: {
    ...Typography.h4,
  },
  nodeSubtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
  nodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  nodeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nodeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nodeGrid: {
    gap: Spacing.md,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  nodeLabel: {
    ...Typography.small,
    width: 70,
  },
  nodeValue: {
    ...Typography.small,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionLabel: {
    ...Typography.caption,
    fontWeight: '600',
  },
  bridgeSectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  bridgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  bridgeCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
    flexGrow: 1,
    flexBasis: '45%',
  },
  bridgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bridgeCardTitle: {
    ...Typography.small,
    fontWeight: '700',
  },
  bridgeCardDesc: {
    ...Typography.caption,
  },
});
