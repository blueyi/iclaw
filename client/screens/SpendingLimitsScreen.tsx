import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { useTheme } from '@/hooks/useTheme';
import { apiRequest, queryClient } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

interface SpendingLimit {
  id: string;
  profileId: string;
  dailyLimit: number;
  monthlyLimit: number;
  alertThreshold: number;
  alertEnabled: boolean;
  currentDailySpend: number;
  currentMonthlySpend: number;
  updatedAt: string;
}

interface SpendingAlert {
  type: string;
  message: string;
  severity: 'warning' | 'critical';
}

interface CostSummary {
  byModel: Record<string, { count: number; totalCost: number; totalInput: number; totalOutput: number }>;
  totalCost: number;
}

function ProgressBar({ current, limit, color }: { current: number; limit: number; color: string }) {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isOver = percentage >= 100;
  const isWarning = percentage >= 80;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${percentage}%`,
              backgroundColor: isOver ? Colors.dark.error : isWarning ? Colors.dark.warning : color,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: isOver ? Colors.dark.error : isWarning ? Colors.dark.warning : Colors.dark.textSecondary }]}>
        {percentage.toFixed(1)}%
      </Text>
    </View>
  );
}

function SpendCard({
  title,
  icon,
  iconColor,
  current,
  limit,
  barColor,
}: {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  current: number;
  limit: number;
  barColor: string;
}) {
  const { theme } = useTheme();
  const remaining = Math.max(0, limit - current);

  return (
    <View style={[styles.spendCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]} testID={`card-${title.toLowerCase().replace(' ', '-')}`}>
      <View style={styles.spendCardHeader}>
        <View style={[styles.spendIconWrap, { backgroundColor: `${iconColor}18` }]}>
          <Feather name={icon} size={20} color={iconColor} />
        </View>
        <Text style={[styles.spendCardTitle, { color: theme.text }]}>{title}</Text>
      </View>

      <View style={styles.spendAmounts}>
        <View>
          <Text style={[styles.spendLabel, { color: theme.textTertiary }]}>Spent</Text>
          <Text style={[styles.spendValue, { color: theme.text }]}>${(current / 100).toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.spendLabel, { color: theme.textTertiary }]}>Limit</Text>
          <Text style={[styles.spendValue, { color: theme.text }]}>${(limit / 100).toFixed(2)}</Text>
        </View>
      </View>

      <ProgressBar current={current} limit={limit} color={barColor} />

      <Text style={[styles.remainingText, { color: theme.textSecondary }]}>
        ${(remaining / 100).toFixed(2)} remaining
      </Text>
    </View>
  );
}

function AlertBanner({ alerts }: { alerts: SpendingAlert[] }) {
  if (!Array.isArray(alerts) || alerts.length === 0) return null;

  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');
  const displayAlerts = [...critical, ...warnings];

  return (
    <View style={styles.alertContainer}>
      {displayAlerts.map((alert, index) => (
        <View
          key={`${alert.type}-${index}`}
          style={[
            styles.alertBanner,
            {
              backgroundColor: alert.severity === 'critical'
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(245,158,11,0.12)',
              borderColor: alert.severity === 'critical'
                ? 'rgba(239,68,68,0.3)'
                : 'rgba(245,158,11,0.3)',
            },
          ]}
        >
          <Feather
            name={alert.severity === 'critical' ? 'alert-triangle' : 'alert-circle'}
            size={18}
            color={alert.severity === 'critical' ? Colors.dark.error : Colors.dark.warning}
          />
          <Text
            style={[
              styles.alertText,
              {
                color: alert.severity === 'critical' ? Colors.dark.error : Colors.dark.warning,
              },
            ]}
          >
            {alert.message}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SpendingHistoryChart({ summary }: { summary: CostSummary | undefined }) {
  const { theme } = useTheme();

  if (!summary || Object.keys(summary.byModel).length === 0) {
    return (
      <View style={[styles.chartCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Spending Breakdown</Text>
        <View style={styles.emptyChart}>
          <Feather name="bar-chart-2" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
            No spending data recorded yet
          </Text>
        </View>
      </View>
    );
  }

  const modelEntries = Object.entries(summary.byModel).sort((a, b) => b[1].totalCost - a[1].totalCost);
  const maxCost = Math.max(...modelEntries.map(([, v]) => v.totalCost), 0.001);

  const MODEL_COLORS: Record<string, string> = {
    'gpt-4': '#10b981',
    'gpt-4o': '#22d3ee',
    'gpt-4o-mini': '#6366f1',
    'gpt-3.5-turbo': '#F59E0B',
    'claude': '#9b5cff',
    'gemini': '#60a5fa',
    'deepseek': '#c4b5fd',
    'ollama': '#8C97AD',
  };

  function getModelColor(model: string): string {
    const lower = model.toLowerCase();
    for (const [key, color] of Object.entries(MODEL_COLORS)) {
      if (lower.includes(key)) return color;
    }
    return '#8C97AD';
  }

  return (
    <View style={[styles.chartCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
      <View style={styles.chartHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Spending Breakdown</Text>
        <Text style={[styles.totalSpend, { color: Colors.dark.cyan }]}>
          ${summary.totalCost.toFixed(4)}
        </Text>
      </View>

      {modelEntries.map(([model, data]) => {
        const barWidth = Math.max((data.totalCost / maxCost) * 100, 3);
        const color = getModelColor(model);

        return (
          <View key={model} style={styles.chartRow}>
            <View style={styles.chartLabelRow}>
              <View style={[styles.chartDot, { backgroundColor: color }]} />
              <Text style={[styles.chartModelName, { color: theme.text }]} numberOfLines={1}>
                {model}
              </Text>
              <Text style={[styles.chartCost, { color: theme.textSecondary }]}>
                ${data.totalCost.toFixed(4)}
              </Text>
            </View>
            <View style={styles.chartBarContainer}>
              <View style={[styles.chartBarFill, { width: `${barWidth}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.chartRequests, { color: theme.textTertiary }]}>
              {data.count} request{data.count !== 1 ? 's' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function SpendingLimitsScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { profile } = useProfile();
  const profileId = profile?.id;

  const [dailyLimitInput, setDailyLimitInput] = useState('');
  const [monthlyLimitInput, setMonthlyLimitInput] = useState('');
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: limits, isLoading, refetch, isRefetching } = useQuery<SpendingLimit>({
    queryKey: ['/api/spending-limits', profileId],
    enabled: !!profileId,
  });

  const { data: alerts = [] } = useQuery<SpendingAlert[]>({
    queryKey: ['/api/spending-alerts', profileId],
    enabled: !!profileId,
  });

  const { data: costSummary } = useQuery<CostSummary>({
    queryKey: ['/api/token-costs', profileId, 'summary'],
    enabled: !!profileId,
  });

  useEffect(() => {
    if (limits) {
      setDailyLimitInput((limits.dailyLimit / 100).toFixed(2));
      setMonthlyLimitInput((limits.monthlyLimit / 100).toFixed(2));
      setAlertThreshold(limits.alertThreshold);
      setAlertEnabled(limits.alertEnabled);
      setHasChanges(false);
    }
  }, [limits]);

  const updateMutation = useMutation({
    mutationFn: async (data: { profileId: string; dailyLimit: number; monthlyLimit: number; alertThreshold: number; alertEnabled: boolean }) => {
      const res = await apiRequest('PUT', '/api/spending-limits', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spending-limits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/spending-alerts'] });
      setHasChanges(false);
    },
  });

  const handleSave = () => {
    if (!profileId) return;
    const daily = Math.round(parseFloat(dailyLimitInput || '0') * 100);
    const monthly = Math.round(parseFloat(monthlyLimitInput || '0') * 100);
    updateMutation.mutate({
      profileId,
      dailyLimit: daily,
      monthlyLimit: monthly,
      alertThreshold: Math.round(alertThreshold),
      alertEnabled,
    });
  };

  const handleDailyChange = (text: string) => {
    setDailyLimitInput(text);
    setHasChanges(true);
  };

  const handleMonthlyChange = (text: string) => {
    setMonthlyLimitInput(text);
    setHasChanges(true);
  };

  const handleThresholdChange = (value: number) => {
    setAlertThreshold(value);
    setHasChanges(true);
  };

  const handleAlertToggle = () => {
    setAlertEnabled(!alertEnabled);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]} testID="screen-spending-limits">
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={Colors.dark.primary} />
        }
      >
        <AlertBanner alerts={alerts as SpendingAlert[]} />

        <SpendCard
          title="Daily Spend"
          icon="clock"
          iconColor={Colors.dark.cyan}
          current={limits?.currentDailySpend || 0}
          limit={limits?.dailyLimit || 0}
          barColor={Colors.dark.cyan}
        />

        <SpendCard
          title="Monthly Spend"
          icon="calendar"
          iconColor={Colors.dark.primary}
          current={limits?.currentMonthlySpend || 0}
          limit={limits?.monthlyLimit || 0}
          barColor={Colors.dark.primary}
        />

        <View style={[styles.settingsCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Spending Limits</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Daily Limit ($)</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <Feather name="dollar-sign" size={16} color={theme.textTertiary} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={dailyLimitInput}
                onChangeText={handleDailyChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textPlaceholder}
                testID="input-daily-limit"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Monthly Limit ($)</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <Feather name="dollar-sign" size={16} color={theme.textTertiary} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={monthlyLimitInput}
                onChangeText={handleMonthlyChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textPlaceholder}
                testID="input-monthly-limit"
              />
            </View>
          </View>
        </View>

        <View style={[styles.settingsCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Alert Settings</Text>

          <View style={styles.thresholdSection}>
            <View style={styles.thresholdHeader}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Alert Threshold</Text>
              <Text style={[styles.thresholdValue, { color: Colors.dark.primary }]}>
                {Math.round(alertThreshold)}%
              </Text>
            </View>
            <View style={styles.thresholdButtons}>
              {[50, 60, 70, 80, 90, 95].map((val) => (
                <Pressable
                  key={val}
                  style={[
                    styles.thresholdButton,
                    {
                      backgroundColor: Math.round(alertThreshold) === val
                        ? Colors.dark.primary
                        : theme.backgroundSecondary,
                      borderColor: Math.round(alertThreshold) === val
                        ? Colors.dark.primary
                        : theme.border,
                    },
                  ]}
                  onPress={() => handleThresholdChange(val)}
                  testID={`button-threshold-${val}`}
                >
                  <Text
                    style={[
                      styles.thresholdButtonText,
                      {
                        color: Math.round(alertThreshold) === val
                          ? '#FFF'
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {val}%
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.thresholdDesc, { color: theme.textTertiary }]}>
              Get alerted when spending reaches {Math.round(alertThreshold)}% of your limit
            </Text>
          </View>

          <Pressable
            style={[styles.toggleRow, { borderColor: theme.border }]}
            onPress={handleAlertToggle}
            testID="button-toggle-alerts"
          >
            <View style={styles.toggleInfo}>
              <Feather name="bell" size={20} color={alertEnabled ? Colors.dark.primary : theme.textTertiary} />
              <View>
                <Text style={[styles.toggleLabel, { color: theme.text }]}>Push Notifications</Text>
                <Text style={[styles.toggleDesc, { color: theme.textTertiary }]}>
                  {alertEnabled ? 'Alerts enabled' : 'Alerts disabled'}
                </Text>
              </View>
            </View>
            <View style={[styles.toggleSwitch, { backgroundColor: alertEnabled ? Colors.dark.primary : 'rgba(255,255,255,0.1)' }]}>
              <View style={[styles.toggleKnob, { transform: [{ translateX: alertEnabled ? 20 : 0 }] }]} />
            </View>
          </Pressable>
        </View>

        {hasChanges ? (
          <Pressable
            style={[styles.saveButton, updateMutation.isPending ? styles.saveButtonDisabled : null]}
            onPress={handleSave}
            disabled={updateMutation.isPending}
            testID="button-save-limits"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name="save" size={18} color="#FFF" />
            )}
            <Text style={styles.saveButtonText}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        ) : null}

        <SpendingHistoryChart summary={costSummary} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  alertText: {
    ...Typography.small,
    fontWeight: '600',
    flex: 1,
  },
  spendCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  spendCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  spendIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spendCardTitle: {
    ...Typography.h4,
  },
  spendAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  spendLabel: {
    ...Typography.caption,
    marginBottom: 2,
  },
  spendValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    ...Typography.caption,
    fontWeight: '700',
    width: 48,
    textAlign: 'right',
  },
  remainingText: {
    ...Typography.caption,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  settingsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    height: Spacing.inputHeight,
  },
  input: {
    flex: 1,
    ...Typography.body,
    fontWeight: '600',
  },
  thresholdSection: {
    marginBottom: Spacing.lg,
  },
  thresholdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  thresholdValue: {
    ...Typography.h4,
    fontWeight: '800',
  },
  thresholdButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  thresholdButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  thresholdButtonText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  thresholdDesc: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  toggleLabel: {
    ...Typography.small,
    fontWeight: '600',
  },
  toggleDesc: {
    ...Typography.caption,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 4,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...Typography.button,
    color: '#FFF',
  },
  chartCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  totalSpend: {
    ...Typography.h4,
    fontWeight: '800',
  },
  emptyChart: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  emptyChartText: {
    ...Typography.small,
  },
  chartRow: {
    marginBottom: Spacing.lg,
  },
  chartLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  chartDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chartModelName: {
    ...Typography.small,
    fontWeight: '600',
    flex: 1,
  },
  chartCost: {
    ...Typography.small,
    fontWeight: '700',
  },
  chartBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  chartBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  chartRequests: {
    ...Typography.caption,
  },
});
