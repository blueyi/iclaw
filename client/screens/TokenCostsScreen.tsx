import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

interface TokenCost {
  id: string;
  profileId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  requestType: string;
  createdAt: string;
}

interface CostSummary {
  byModel: Record<string, { count: number; totalCost: number; totalInput: number; totalOutput: number }>;
  totalCost: number;
}

const MODEL_COLORS: Record<string, string> = {
  'gpt-4': '#10b981',
  'gpt-4o': '#22d3ee',
  'gpt-4o-mini': '#6366f1',
  'gpt-3.5-turbo': '#F59E0B',
  'claude-3': '#9b5cff',
  'claude-3.5': '#c4b5fd',
};

function getModelColor(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#8C97AD';
}

function SummarySection({ summary }: { summary: CostSummary }) {
  const modelEntries = Object.entries(summary.byModel);
  const maxCost = Math.max(...modelEntries.map(([, v]) => v.totalCost), 0.001);

  return (
    <View style={styles.summarySection}>
      <View style={styles.totalCard} testID="card-total-cost">
        <Text style={styles.totalLabel}>Total API Spend</Text>
        <Text style={styles.totalAmount}>${summary.totalCost.toFixed(4)}</Text>
        <Text style={styles.totalSub}>{modelEntries.length} model{modelEntries.length !== 1 ? 's' : ''} used</Text>
      </View>

      <Text style={styles.sectionTitle}>Cost by Model</Text>
      {modelEntries.length > 0 ? modelEntries.map(([model, data]) => {
        const barWidth = Math.max((data.totalCost / maxCost) * 100, 2);
        const color = getModelColor(model);

        return (
          <View key={model} style={styles.modelCard} testID={`model-cost-${model}`}>
            <View style={styles.modelHeader}>
              <View style={[styles.modelDot, { backgroundColor: color }]} />
              <Text style={styles.modelName}>{model}</Text>
              <Text style={styles.modelCost}>${data.totalCost.toFixed(4)}</Text>
            </View>
            <View style={styles.barContainer}>
              <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: color }]} />
            </View>
            <View style={styles.modelStats}>
              <Text style={styles.statText}>{data.count} requests</Text>
              <Text style={styles.statText}>{(data.totalInput / 1000).toFixed(1)}K in</Text>
              <Text style={styles.statText}>{(data.totalOutput / 1000).toFixed(1)}K out</Text>
            </View>
          </View>
        );
      }) : (
        <Text style={styles.noDataText}>No cost data recorded yet</Text>
      )}
    </View>
  );
}

function CostItem({ item }: { item: TokenCost }) {
  const color = getModelColor(item.model);
  const time = new Date(item.createdAt).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={styles.costCard} testID={`cost-item-${item.id}`}>
      <View style={styles.costHeader}>
        <View style={[styles.modelDot, { backgroundColor: color }]} />
        <Text style={styles.costModel}>{item.model}</Text>
        <Text style={styles.costAmount}>${parseFloat(item.cost).toFixed(4)}</Text>
      </View>
      <View style={styles.costDetails}>
        <Text style={styles.costDetail}>{item.requestType}</Text>
        <Text style={styles.costDetail}>{item.inputTokens} in / {item.outputTokens} out</Text>
        <Text style={styles.costTime}>{time}</Text>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="dollar-sign" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Cost Data</Text>
      <Text style={styles.emptyText}>
        API token costs will be tracked here when your OpenClaw agent processes requests.
      </Text>
    </View>
  );
}

export default function TokenCostsScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profileId } = useProfile();

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<CostSummary>({
    queryKey: ['/api/token-costs', profileId, 'summary'],
    enabled: !!profileId,
  });

  const { data: costs = [], isLoading: costsLoading, refetch: refetchCosts, isRefetching } = useQuery<TokenCost[]>({
    queryKey: ['/api/token-costs', profileId],
    enabled: !!profileId,
  });

  const isLoading = summaryLoading || costsLoading;

  const onRefresh = () => {
    refetchSummary();
    refetchCosts();
  };

  return (
    <View style={styles.container} testID="screen-token-costs">
      {isLoading ? (
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={costs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CostItem item={item} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerHeight + Spacing.sm, paddingBottom: insets.bottom + Spacing.xl },
          ]}
          ListHeaderComponent={summary ? <SummarySection summary={summary} /> : null}
          ListEmptyComponent={!summary || Object.keys(summary.byModel).length === 0 ? <EmptyState /> : null}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  summarySection: {
    marginBottom: Spacing.xl,
  },
  totalCard: {
    ...Glass.card,
    borderRadius: BorderRadius.card,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  totalLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.dark.text,
    letterSpacing: -1,
  },
  totalSub: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  modelCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modelName: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.text,
    flex: 1,
  },
  modelCost: {
    ...Typography.small,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  barContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  modelStats: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  noDataText: {
    ...Typography.small,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  costCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  costHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  costModel: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.text,
    flex: 1,
  },
  costAmount: {
    ...Typography.small,
    fontWeight: '700',
    color: '#22d3ee',
  },
  costDetails: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  costDetail: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  costTime: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginLeft: 'auto',
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
  },
});
