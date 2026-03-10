import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

interface SystemMetric {
  id: string;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  cpuModel: string | null;
  totalMemoryMb: number | null;
  totalDiskMb: number | null;
  uptime: number | null;
  createdAt: string;
}

function CircularGauge({ value, label, color, icon }: { value: number; label: string; color: string; icon: keyof typeof Feather.glyphMap }) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100) / 100;

  const getStatusColor = (val: number) => {
    if (val >= 90) return Colors.dark.error;
    if (val >= 70) return Colors.dark.warning;
    return color;
  };

  const statusColor = getStatusColor(value);

  return (
    <View style={styles.gaugeContainer}>
      <View style={[styles.gaugeRing, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={[styles.gaugeTrack, { width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth, borderColor: 'rgba(255,255,255,0.05)' }]}>
          <View style={[styles.gaugeProgress, {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderTopColor: statusColor,
            borderRightColor: progress > 0.25 ? statusColor : 'transparent',
            borderBottomColor: progress > 0.5 ? statusColor : 'transparent',
            borderLeftColor: progress > 0.75 ? statusColor : 'transparent',
            transform: [{ rotate: '-90deg' }],
            position: 'absolute',
          }]} />
        </View>
        <View style={styles.gaugeCenter}>
          <Feather name={icon} size={16} color={statusColor} />
          <Text style={[styles.gaugeValue, { color: statusColor }]}>{value}%</Text>
        </View>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  );
}

function formatUptime(seconds: number | null): string {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatMb(mb: number | null): string {
  if (!mb) return 'N/A';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function InfoCard({ icon, label, value, color }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={styles.infoCard}>
      <Feather name={icon} size={18} color={color} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function HistoryItem({ item, index }: { item: SystemMetric; index: number }) {
  const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={styles.historyRow} testID={`metric-history-${index}`}>
      <Text style={styles.historyTime}>{time}</Text>
      <View style={styles.historyValues}>
        <Text style={[styles.historyVal, { color: item.cpuPercent >= 90 ? Colors.dark.error : '#22d3ee' }]}>
          CPU {item.cpuPercent}%
        </Text>
        <Text style={[styles.historyVal, { color: item.memoryPercent >= 90 ? Colors.dark.error : '#9b5cff' }]}>
          MEM {item.memoryPercent}%
        </Text>
        <Text style={[styles.historyVal, { color: item.diskPercent >= 90 ? Colors.dark.error : '#10b981' }]}>
          DSK {item.diskPercent}%
        </Text>
      </View>
    </View>
  );
}

export default function SystemMetricsScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const { data: metrics, isLoading, refetch, isRefetching } = useQuery<SystemMetric>({
    queryKey: ['/api/system-metrics'],
    refetchInterval: 5000,
  });

  const { data: history = [] } = useQuery<SystemMetric[]>({
    queryKey: ['/api/system-metrics/history'],
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const cpu = metrics?.cpuPercent || 0;
  const mem = metrics?.memoryPercent || 0;
  const disk = metrics?.diskPercent || 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />}
      showsVerticalScrollIndicator={false}
      testID="screen-system-metrics"
    >
      <View style={styles.gaugeRow}>
        <CircularGauge value={cpu} label="CPU" color="#22d3ee" icon="cpu" />
        <CircularGauge value={mem} label="Memory" color="#9b5cff" icon="hard-drive" />
        <CircularGauge value={disk} label="Disk" color="#10b981" icon="database" />
      </View>

      <Text style={styles.sectionTitle}>System Info</Text>
      <View style={styles.infoGrid}>
        <InfoCard icon="cpu" label="CPU Model" value={metrics?.cpuModel || 'Unknown'} color="#22d3ee" />
        <InfoCard icon="hard-drive" label="Total RAM" value={formatMb(metrics?.totalMemoryMb || null)} color="#9b5cff" />
        <InfoCard icon="database" label="Total Disk" value={formatMb(metrics?.totalDiskMb || null)} color="#10b981" />
        <InfoCard icon="clock" label="Uptime" value={formatUptime(metrics?.uptime || null)} color="#F59E0B" />
      </View>

      {history.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Recent Readings</Text>
          <View style={styles.historyCard}>
            {history.slice(0, 10).map((item, index) => (
              <HistoryItem key={item.id} item={item} index={index} />
            ))}
          </View>
        </>
      ) : null}

      {!metrics?.cpuModel ? (
        <View style={styles.hintCard}>
          <Feather name="info" size={16} color={Colors.dark.textSecondary} />
          <Text style={styles.hintText}>
            Connect to your OpenClaw Gateway to see real-time server metrics. The Gateway will report CPU, memory, and disk usage automatically.
          </Text>
        </View>
      ) : null}
    </ScrollView>
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
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing['2xl'],
  },
  gaugeContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  gaugeRing: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeTrack: {
    position: 'absolute',
  },
  gaugeProgress: {},
  gaugeCenter: {
    alignItems: 'center',
    gap: 2,
  },
  gaugeValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  gaugeLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: '600',
  },
  sectionTitle: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  infoGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  infoCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoLabel: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  infoValue: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  historyCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  historyTime: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    width: 55,
  },
  historyValues: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  historyVal: {
    ...Typography.caption,
    fontWeight: '600',
  },
  hintCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  hintText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});
