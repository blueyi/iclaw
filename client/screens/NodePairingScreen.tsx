import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '@/contexts/ProfileContext';
import { apiRequest } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography, Glass, Gradients } from '@/constants/theme';

type NodeStatus = 'paired' | 'pending' | 'disconnected';

interface PairedNode {
  id: string;
  profileId: string;
  nodeId: string;
  nodeName: string;
  platform: string;
  capabilities: string;
  status: NodeStatus;
  pairedAt: string;
  lastSeenAt: string | null;
}

const STATUS_CONFIG: Record<NodeStatus, { color: string; icon: keyof typeof Feather.glyphMap; label: string }> = {
  paired: { color: '#10b981', icon: 'check-circle', label: 'Connected' },
  pending: { color: '#F59E0B', icon: 'clock', label: 'Pending' },
  disconnected: { color: '#EF4444', icon: 'x-circle', label: 'Disconnected' },
};

const CAPABILITY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  camera: 'camera',
  gps: 'map-pin',
  canvas: 'edit-3',
  microphone: 'mic',
  storage: 'hard-drive',
  sensors: 'thermometer',
  bluetooth: 'bluetooth',
  nfc: 'wifi',
};

function NodeCard({
  node,
  onApprove,
  onUnpair,
  onInvoke,
  onPress,
}: {
  node: PairedNode;
  onApprove: (id: string) => void;
  onUnpair: (id: string) => void;
  onInvoke: (id: string, capability: string) => void;
  onPress: (node: PairedNode) => void;
}) {
  const statusConfig = STATUS_CONFIG[node.status];
  let capabilities: string[] = [];
  try {
    capabilities = JSON.parse(node.capabilities || '[]');
  } catch {}

  const lastSeen = node.lastSeenAt
    ? new Date(node.lastSeenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <Pressable
      style={styles.nodeCard}
      onPress={() => onPress(node)}
      testID={`card-node-${node.id}`}
    >
      <View style={styles.nodeHeader}>
        <LinearGradient
          colors={node.status === 'paired' ? ['#10b981', '#059669'] : node.status === 'pending' ? ['#F59E0B', '#D97706'] : ['#6B7280', '#4B5563']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nodeIconWrap}
        >
          <Feather name="smartphone" size={20} color="#FFF" />
        </LinearGradient>
        <View style={styles.nodeInfo}>
          <Text style={styles.nodeName} numberOfLines={1}>{node.nodeName}</Text>
          <Text style={styles.nodePlatform}>{node.platform}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
          <Feather name={statusConfig.icon} size={12} color={statusConfig.color} />
          <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
        </View>
      </View>

      {capabilities.length > 0 ? (
        <View style={styles.capabilitiesRow}>
          {capabilities.slice(0, 5).map((cap) => (
            <View key={cap} style={styles.capBadge}>
              <Feather
                name={CAPABILITY_ICONS[cap] || 'box'}
                size={12}
                color={Colors.dark.textSecondary}
              />
              <Text style={styles.capText}>{cap}</Text>
            </View>
          ))}
          {capabilities.length > 5 ? (
            <View style={styles.capBadge}>
              <Text style={styles.capText}>+{capabilities.length - 5}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.nodeFooter}>
        <Text style={styles.lastSeenText}>Last seen: {lastSeen}</Text>
        <View style={styles.nodeActions}>
          {node.status === 'pending' ? (
            <Pressable
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => onApprove(node.id)}
              testID={`button-approve-${node.id}`}
            >
              <Feather name="check" size={14} color="#10b981" />
              <Text style={[styles.actionBtnText, { color: '#10b981' }]}>Approve</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.actionBtn, styles.unpairBtn]}
            onPress={() => onUnpair(node.id)}
            testID={`button-unpair-${node.id}`}
          >
            <Feather name="link-2" size={14} color={Colors.dark.error} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function NodeDetailModal({
  node,
  visible,
  onClose,
  onInvoke,
}: {
  node: PairedNode | null;
  visible: boolean;
  onClose: () => void;
  onInvoke: (id: string, capability: string) => void;
}) {
  if (!node) return null;

  let capabilities: string[] = [];
  try {
    capabilities = JSON.parse(node.capabilities || '[]');
  } catch {}

  const statusConfig = STATUS_CONFIG[node.status];

  return (
    <Modal visible={visible} animationType="slide" transparent testID="modal-node-detail">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{node.nodeName}</Text>
            <Pressable onPress={onClose} testID="button-close-detail">
              <Feather name="x" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Node ID</Text>
            <Text style={styles.detailValue} numberOfLines={1}>{node.nodeId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Platform</Text>
            <Text style={styles.detailValue}>{node.platform}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
              <Feather name={statusConfig.icon} size={12} color={statusConfig.color} />
              <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Paired At</Text>
            <Text style={styles.detailValue}>{new Date(node.pairedAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last Seen</Text>
            <Text style={styles.detailValue}>
              {node.lastSeenAt ? new Date(node.lastSeenAt).toLocaleString() : 'Never'}
            </Text>
          </View>

          <Text style={styles.capSectionTitle}>Capabilities</Text>
          {capabilities.length > 0 ? (
            <View style={styles.capGrid}>
              {capabilities.map((cap) => (
                <Pressable
                  key={cap}
                  style={styles.capCard}
                  onPress={() => {
                    if (node.status === 'paired') {
                      onInvoke(node.id, cap);
                    }
                  }}
                  testID={`button-invoke-${cap}`}
                >
                  <Feather
                    name={CAPABILITY_ICONS[cap] || 'box'}
                    size={20}
                    color={node.status === 'paired' ? Colors.dark.primary : Colors.dark.textTertiary}
                  />
                  <Text style={[styles.capCardText, node.status !== 'paired' ? { color: Colors.dark.textTertiary } : null]}>
                    {cap}
                  </Text>
                  {node.status === 'paired' ? (
                    <Feather name="play" size={14} color={Colors.dark.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.noCapsText}>No capabilities reported</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AddDeviceModal({
  visible,
  onClose,
  onPair,
}: {
  visible: boolean;
  onClose: () => void;
  onPair: (name: string, ip: string) => void;
}) {
  const [deviceName, setDeviceName] = useState('');
  const [deviceIp, setDeviceIp] = useState('');
  const [showManual, setShowManual] = useState(false);

  const handlePair = () => {
    if (!deviceName.trim()) return;
    onPair(deviceName.trim(), deviceIp.trim());
    setDeviceName('');
    setDeviceIp('');
    setShowManual(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent testID="modal-add-device">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Device</Text>
            <Pressable onPress={onClose} testID="button-close-add">
              <Feather name="x" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          {!showManual ? (
            <View style={styles.qrSection}>
              <View style={styles.qrPlaceholder}>
                <Feather name="maximize" size={64} color={Colors.dark.primary} />
                <Text style={styles.qrText}>QR Code Pairing</Text>
                <Text style={styles.qrSubtext}>
                  Scan this code from the device you want to pair
                </Text>
              </View>

              <View style={styles.qrDataBox}>
                <Text style={styles.qrDataLabel}>Pairing Code</Text>
                <Text style={styles.qrDataValue} selectable>
                  ICLAW-{Math.random().toString(36).substring(2, 8).toUpperCase()}
                </Text>
              </View>

              <Pressable
                style={styles.manualLink}
                onPress={() => setShowManual(true)}
                testID="button-manual-entry"
              >
                <Feather name="edit-2" size={16} color={Colors.dark.primary} />
                <Text style={styles.manualLinkText}>Enter manually instead</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.manualSection}>
              <Text style={styles.inputLabel}>Device Name</Text>
              <TextInput
                style={styles.textInput}
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder="e.g., Living Room iPad"
                placeholderTextColor={Colors.dark.textPlaceholder}
                testID="input-device-name"
              />

              <Text style={styles.inputLabel}>IP Address (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={deviceIp}
                onChangeText={setDeviceIp}
                placeholder="e.g., 192.168.1.100"
                placeholderTextColor={Colors.dark.textPlaceholder}
                keyboardType="numeric"
                testID="input-device-ip"
              />

              <Pressable
                style={[styles.pairButton, !deviceName.trim() ? styles.pairButtonDisabled : null]}
                onPress={handlePair}
                disabled={!deviceName.trim()}
                testID="button-pair-device"
              >
                <LinearGradient
                  colors={Gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.pairButtonGradient}
                >
                  <Feather name="link" size={18} color="#FFF" />
                  <Text style={styles.pairButtonText}>Pair Device</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={styles.manualLink}
                onPress={() => setShowManual(false)}
                testID="button-show-qr"
              >
                <Feather name="maximize" size={16} color={Colors.dark.primary} />
                <Text style={styles.manualLinkText}>Show QR code instead</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="link-2" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Paired Devices</Text>
      <Text style={styles.emptyText}>
        Connect devices to your OpenClaw network to extend your agent's capabilities across multiple nodes.
      </Text>
      <Pressable style={styles.emptyButton} onPress={onAdd} testID="button-add-first-device">
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyButtonGradient}
        >
          <Feather name="plus" size={18} color="#FFF" />
          <Text style={styles.emptyButtonText}>Add Device</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function NodePairingScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const profileId = profile?.id;
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedNode, setSelectedNode] = useState<PairedNode | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { data: nodes = [], isLoading, refetch, isRefetching } = useQuery<PairedNode[]>({
    queryKey: ['/api/nodes', profileId],
    enabled: !!profileId,
  });

  const approveMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await apiRequest('PUT', `/api/nodes/${nodeId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/nodes'] });
    },
  });

  const unpairMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await apiRequest('DELETE', `/api/nodes/${nodeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/nodes'] });
      setShowDetail(false);
      setSelectedNode(null);
    },
  });

  const pairMutation = useMutation({
    mutationFn: async ({ name, ip }: { name: string; ip: string }) => {
      await apiRequest('POST', '/api/nodes/pair', {
        profileId,
        nodeName: name,
        ipAddress: ip,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/nodes'] });
      setShowAddModal(false);
    },
  });

  const invokeMutation = useMutation({
    mutationFn: async ({ nodeId, capability }: { nodeId: string; capability: string }) => {
      await apiRequest('POST', `/api/nodes/${nodeId}/invoke`, { capability });
    },
  });

  const handleApprove = useCallback((id: string) => {
    approveMutation.mutate(id);
  }, [approveMutation]);

  const handleUnpair = useCallback((id: string) => {
    unpairMutation.mutate(id);
  }, [unpairMutation]);

  const handleInvoke = useCallback((id: string, capability: string) => {
    invokeMutation.mutate({ nodeId: id, capability });
  }, [invokeMutation]);

  const handlePair = useCallback((name: string, ip: string) => {
    pairMutation.mutate({ name, ip });
  }, [pairMutation]);

  const handleNodePress = useCallback((node: PairedNode) => {
    setSelectedNode(node);
    setShowDetail(true);
  }, []);

  const pairedCount = nodes.filter(n => n.status === 'paired').length;
  const pendingCount = nodes.filter(n => n.status === 'pending').length;

  return (
    <View style={styles.container} testID="screen-node-pairing">
      <View style={[styles.summaryBar, { marginTop: headerHeight + Spacing.sm }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{nodes.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#10b981' }]}>{pairedCount}</Text>
          <Text style={styles.summaryLabel}>Connected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
          testID="button-add-device"
        >
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addButtonGradient}
          >
            <Feather name="plus" size={18} color="#FFF" />
          </LinearGradient>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={nodes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NodeCard
              node={item}
              onApprove={handleApprove}
              onUnpair={handleUnpair}
              onInvoke={handleInvoke}
              onPress={handleNodePress}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          ListEmptyComponent={<EmptyState onAdd={() => setShowAddModal(true)} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={Colors.dark.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <AddDeviceModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onPair={handlePair}
      />

      <NodeDetailModal
        node={selectedNode}
        visible={showDetail}
        onClose={() => {
          setShowDetail(false);
          setSelectedNode(null);
        }}
        onInvoke={handleInvoke}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.dark.border,
  },
  addButton: {
    marginLeft: 'auto',
  },
  addButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  nodeCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  nodeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeInfo: {
    flex: 1,
  },
  nodeName: {
    ...Typography.small,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  nodePlatform: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  capabilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  capBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  capText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  nodeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastSeenText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  nodeActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  approveBtn: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  actionBtnText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  detailLabel: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  detailValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },
  capSectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  capGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  capCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexBasis: '45%',
    flexGrow: 1,
  },
  capCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    flex: 1,
  },
  noCapsText: {
    ...Typography.small,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  qrSection: {
    alignItems: 'center',
    paddingBottom: Spacing['3xl'],
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(155,92,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(155,92,255,0.2)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  qrText: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  qrSubtext: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xl,
  },
  qrDataBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  qrDataLabel: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginBottom: Spacing.xs,
  },
  qrDataValue: {
    ...Typography.h4,
    color: Colors.dark.primary,
    letterSpacing: 2,
  },
  manualLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  manualLinkText: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  manualSection: {
    paddingBottom: Spacing['3xl'],
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    ...Typography.body,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  pairButton: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  pairButtonDisabled: {
    opacity: 0.5,
  },
  pairButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  pairButtonText: {
    ...Typography.button,
    color: '#FFF',
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
    marginBottom: Spacing.xl,
  },
  emptyButton: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
  },
  emptyButtonText: {
    ...Typography.button,
    color: '#FFF',
  },
});
