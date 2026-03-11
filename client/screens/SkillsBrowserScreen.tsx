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
  Switch,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { apiRequest } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

type SecurityStatus = 'vetted' | 'unreviewed' | 'flagged';

interface BrowseSkill {
  name: string;
  description: string;
  source: string;
  category: string;
  securityStatus: SecurityStatus;
}

interface InstalledSkill {
  id: string;
  profileId: string;
  skillName: string;
  description: string;
  source: string;
  isEnabled: boolean;
  securityStatus: SecurityStatus;
  config: string | null;
  installedAt: string;
}

type TabType = 'browse' | 'installed';

const SECURITY_CONFIG: Record<SecurityStatus, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  vetted: { icon: 'shield', color: '#10b981', label: 'Vetted' },
  unreviewed: { icon: 'alert-triangle', color: '#F59E0B', label: 'Unreviewed' },
  flagged: { icon: 'x-circle', color: '#EF4444', label: 'Flagged' },
};

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  'Communication': 'message-circle',
  'DevOps': 'terminal',
  'Productivity': 'briefcase',
  'Data': 'database',
  'Security': 'lock',
  'AI': 'cpu',
  'Utility': 'tool',
};

function SecurityBadge({ status }: { status: SecurityStatus }) {
  const config = SECURITY_CONFIG[status];
  return (
    <View style={[styles.securityBadge, { backgroundColor: `${config.color}15` }]}>
      <Feather name={config.icon} size={12} color={config.color} />
      <Text style={[styles.securityBadgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function SkillDetailModal({
  visible,
  onClose,
  skill,
  isInstalled,
  onInstall,
  onUninstall,
  installing,
}: {
  visible: boolean;
  onClose: () => void;
  skill: BrowseSkill | InstalledSkill | null;
  isInstalled: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  installing: boolean;
}) {
  if (!skill) return null;

  const name = 'skillName' in skill ? skill.skillName : skill.name;
  const secStatus = skill.securityStatus as SecurityStatus;
  const config = SECURITY_CONFIG[secStatus];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>{name}</Text>
              <Pressable onPress={onClose} testID="button-close-skill-detail">
                <Feather name="x" size={24} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>
            <SecurityBadge status={secStatus} />
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalDescription}>{skill.description}</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Source</Text>
              <Text style={styles.detailValue}>{skill.source}</Text>
            </View>

            {'category' in skill ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Category</Text>
                <Text style={styles.detailValue}>{skill.category}</Text>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Security</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                <Feather name={config.icon} size={14} color={config.color} />
                <Text style={[styles.detailValue, { color: config.color }]}>{config.label}</Text>
              </View>
            </View>

            {'config' in skill && skill.config ? (
              <View style={styles.configSection}>
                <Text style={styles.configTitle}>Configuration</Text>
                <View style={styles.configBox}>
                  <Text style={styles.configText}>{skill.config}</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.modalActions}>
            {isInstalled ? (
              <Pressable
                style={[styles.modalButton, styles.uninstallButton]}
                onPress={onUninstall}
                disabled={installing}
                testID="button-uninstall-skill"
              >
                {installing ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Feather name="trash-2" size={16} color="#EF4444" />
                    <Text style={styles.uninstallButtonText}>Uninstall</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.modalButton, styles.installButton]}
                onPress={onInstall}
                disabled={installing}
                testID="button-install-skill"
              >
                {installing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Feather name="download" size={16} color="#FFF" />
                    <Text style={styles.installButtonText}>Install</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BrowseSkillCard({
  skill,
  onPress,
  installedNames,
}: {
  skill: BrowseSkill;
  onPress: () => void;
  installedNames: Set<string>;
}) {
  const categoryIcon = CATEGORY_ICONS[skill.category] || 'box';
  const isInstalled = installedNames.has(skill.name);

  return (
    <Pressable
      style={styles.skillCard}
      onPress={onPress}
      testID={`card-skill-browse-${skill.name}`}
    >
      <View style={styles.skillCardHeader}>
        <View style={[styles.skillIconWrap, { backgroundColor: 'rgba(155,92,255,0.12)' }]}>
          <Feather name={categoryIcon} size={20} color="#9b5cff" />
        </View>
        <View style={styles.skillCardHeaderText}>
          <Text style={styles.skillCardName}>{skill.name}</Text>
          <Text style={styles.skillCardSource}>{skill.source}</Text>
        </View>
        {isInstalled ? (
          <View style={styles.installedBadge}>
            <Feather name="check" size={12} color="#10b981" />
            <Text style={styles.installedBadgeText}>Installed</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.skillCardDesc} numberOfLines={2}>{skill.description}</Text>
      <View style={styles.skillCardFooter}>
        <SecurityBadge status={skill.securityStatus} />
        <Text style={styles.skillCardCategory}>{skill.category}</Text>
      </View>
    </Pressable>
  );
}

function InstalledSkillCard({
  skill,
  onPress,
  onToggle,
}: {
  skill: InstalledSkill;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <Pressable
      style={styles.skillCard}
      onPress={onPress}
      testID={`card-skill-installed-${skill.id}`}
    >
      <View style={styles.skillCardHeader}>
        <View style={[styles.skillIconWrap, { backgroundColor: skill.isEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)' }]}>
          <Feather name="package" size={20} color={skill.isEnabled ? '#10b981' : Colors.dark.textTertiary} />
        </View>
        <View style={styles.skillCardHeaderText}>
          <Text style={styles.skillCardName}>{skill.skillName}</Text>
          <Text style={styles.skillCardSource}>{skill.source}</Text>
        </View>
        <Switch
          value={skill.isEnabled}
          onValueChange={onToggle}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(16,185,129,0.3)' }}
          thumbColor={skill.isEnabled ? '#10b981' : Colors.dark.textTertiary}
          testID={`switch-skill-${skill.id}`}
        />
      </View>
      <Text style={styles.skillCardDesc} numberOfLines={2}>{skill.description}</Text>
      <View style={styles.skillCardFooter}>
        <SecurityBadge status={skill.securityStatus} />
        <Text style={styles.skillCardDate}>
          {new Date(skill.installedAt).toLocaleDateString()}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyBrowseState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="package" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Skills Found</Text>
      <Text style={styles.emptyText}>
        No skills match your search. Try adjusting your filters.
      </Text>
    </View>
  );
}

function EmptyInstalledState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Feather name="download" size={48} color={Colors.dark.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Installed Skills</Text>
      <Text style={styles.emptyText}>
        Browse available skills and install them to extend your agent's capabilities.
      </Text>
    </View>
  );
}

export default function SkillsBrowserScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const profileId = profile?.id;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<BrowseSkill | InstalledSkill | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedIsInstalled, setSelectedIsInstalled] = useState(false);

  const { data: browseSkills = [], isLoading: browseLoading, refetch: refetchBrowse, isRefetching: browseRefetching } = useQuery<BrowseSkill[]>({
    queryKey: ['/api/skills/browse'],
  });

  const { data: installedSkills = [], isLoading: installedLoading, refetch: refetchInstalled, isRefetching: installedRefetching } = useQuery<InstalledSkill[]>({
    queryKey: ['/api/skills', profileId],
    enabled: !!profileId,
  });

  const installedNames = new Set(installedSkills.map(s => s.skillName));

  const installMutation = useMutation({
    mutationFn: async (skill: BrowseSkill) => {
      await apiRequest('POST', '/api/skills/install', {
        profileId,
        skillName: skill.name,
        description: skill.description,
        source: skill.source,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/skills', profileId] });
      setDetailModalVisible(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      await apiRequest('PUT', `/api/skills/${id}/toggle`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/skills', profileId] });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/skills', profileId] });
      setDetailModalVisible(false);
    },
  });

  const filteredBrowseSkills = browseSkills.filter(skill => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.category.toLowerCase().includes(q)
    );
  });

  const filteredInstalledSkills = installedSkills.filter(skill => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      skill.skillName.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q)
    );
  });

  const openDetail = useCallback((skill: BrowseSkill | InstalledSkill, installed: boolean) => {
    setSelectedSkill(skill);
    setSelectedIsInstalled(installed);
    setDetailModalVisible(true);
  }, []);

  const handleInstall = useCallback(() => {
    if (selectedSkill && 'name' in selectedSkill) {
      installMutation.mutate(selectedSkill as BrowseSkill);
    }
  }, [selectedSkill, installMutation]);

  const handleUninstall = useCallback(() => {
    if (selectedSkill && 'id' in selectedSkill) {
      uninstallMutation.mutate((selectedSkill as InstalledSkill).id);
    }
  }, [selectedSkill, uninstallMutation]);

  const handleToggle = useCallback((id: string, isEnabled: boolean) => {
    toggleMutation.mutate({ id, isEnabled });
  }, [toggleMutation]);

  const onRefresh = useCallback(() => {
    if (activeTab === 'browse') {
      refetchBrowse();
    } else {
      refetchInstalled();
    }
  }, [activeTab, refetchBrowse, refetchInstalled]);

  const isLoading = activeTab === 'browse' ? browseLoading : installedLoading;
  const isRefetching = activeTab === 'browse' ? browseRefetching : installedRefetching;

  return (
    <View style={styles.container} testID="screen-skills-browser">
      <View style={[styles.headerArea, { paddingTop: headerHeight + Spacing.sm }]}>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, activeTab === 'browse' ? styles.tabActive : null]}
            onPress={() => setActiveTab('browse')}
            testID="tab-browse"
          >
            <Feather name="compass" size={16} color={activeTab === 'browse' ? '#9b5cff' : Colors.dark.textTertiary} />
            <Text style={[styles.tabText, activeTab === 'browse' ? styles.tabTextActive : null]}>Browse</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'installed' ? styles.tabActive : null]}
            onPress={() => setActiveTab('installed')}
            testID="tab-installed"
          >
            <Feather name="package" size={16} color={activeTab === 'installed' ? '#9b5cff' : Colors.dark.textTertiary} />
            <Text style={[styles.tabText, activeTab === 'installed' ? styles.tabTextActive : null]}>
              Installed ({installedSkills.length})
            </Text>
          </Pressable>
        </View>

        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={Colors.dark.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'browse' ? 'Search skills...' : 'Filter installed...'}
            placeholderTextColor={Colors.dark.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            testID="input-search-skills"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} testID="button-clear-search">
              <Feather name="x" size={16} color={Colors.dark.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : activeTab === 'browse' ? (
        <FlatList
          data={filteredBrowseSkills}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <BrowseSkillCard
              skill={item}
              onPress={() => openDetail(item, installedNames.has(item.name))}
              installedNames={installedNames}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={EmptyBrowseState}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={filteredInstalledSkills}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InstalledSkillCard
              skill={item}
              onPress={() => openDetail(item, true)}
              onToggle={(enabled) => handleToggle(item.id, enabled)}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={EmptyInstalledState}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <SkillDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        skill={selectedSkill}
        isInstalled={selectedIsInstalled}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        installing={installMutation.isPending || uninstallMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerArea: {
    paddingHorizontal: Spacing.lg,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabActive: {
    backgroundColor: 'rgba(155,92,255,0.12)',
  },
  tabText: {
    ...Typography.small,
    color: Colors.dark.textTertiary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#9b5cff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.text,
    paddingVertical: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  skillCard: {
    ...Glass.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  skillCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  skillIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillCardHeaderText: {
    flex: 1,
  },
  skillCardName: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: '700',
  },
  skillCardSource: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    marginTop: 2,
  },
  skillCardDesc: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  skillCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skillCardCategory: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  skillCardDate: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
  },
  installedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  installedBadgeText: {
    ...Typography.caption,
    color: '#10b981',
    fontWeight: '600',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.badge,
  },
  securityBadgeText: {
    ...Typography.caption,
    fontWeight: '600',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    flex: 1,
  },
  modalBody: {
    padding: Spacing.xl,
  },
  modalDescription: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.borderSubtle,
  },
  detailLabel: {
    ...Typography.small,
    color: Colors.dark.textTertiary,
  },
  detailValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: '600',
  },
  configSection: {
    marginTop: Spacing.xl,
  },
  configTitle: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  configBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  configText: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    fontFamily: 'monospace',
  },
  modalActions: {
    padding: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  installButton: {
    backgroundColor: '#9b5cff',
  },
  installButtonText: {
    ...Typography.button,
    color: '#FFF',
  },
  uninstallButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  uninstallButtonText: {
    ...Typography.button,
    color: '#EF4444',
  },
});
