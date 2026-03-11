import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { useProfile } from '@/contexts/ProfileContext';
import { useTheme } from '@/hooks/useTheme';
import { apiRequest, queryClient } from '@/lib/query-client';
import { Colors, Spacing, BorderRadius, Typography, Glass } from '@/constants/theme';

interface SoulConfig {
  id: string;
  profileId: string;
  name: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
}

export default function SoulEditorScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { profile } = useProfile();
  const profileId = profile?.id;

  const [editorName, setEditorName] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');

  const { data: configs = [], isLoading } = useQuery<SoulConfig[]>({
    queryKey: ['/api/soul-configs', profileId],
    enabled: !!profileId,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['/api/soul-configs/templates'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; content: string }) => {
      const res = await apiRequest('POST', '/api/soul-configs', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/soul-configs', profileId] });
      resetEditor();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; content?: string } }) => {
      const res = await apiRequest('PUT', `/api/soul-configs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/soul-configs', profileId] });
      resetEditor();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/soul-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/soul-configs', profileId] });
      resetEditor();
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/soul-configs/${id}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/soul-configs', profileId] });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { name?: string; url?: string; content?: string }) => {
      const res = await apiRequest('POST', '/api/soul-configs/import', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/soul-configs', profileId] });
      setShowImport(false);
      setImportUrl('');
      setImportName('');
    },
  });

  const resetEditor = useCallback(() => {
    setEditorName('');
    setEditorContent('');
    setEditingId(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!editorName.trim() || !editorContent.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { name: editorName, content: editorContent } });
    } else {
      createMutation.mutate({ name: editorName, content: editorContent });
    }
  }, [editorName, editorContent, editingId]);

  const handleEdit = useCallback((config: SoulConfig) => {
    setEditorName(config.name);
    setEditorContent(config.content);
    setEditingId(config.id);
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, []);

  const handleExport = useCallback(async (content: string) => {
    await Clipboard.setStringAsync(content);
  }, []);

  const handleTemplateSelect = useCallback((template: Template) => {
    setEditorName(template.name);
    setEditorContent(template.content);
    setEditingId(null);
    setShowTemplates(false);
  }, []);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]} testID="screen-soul-editor">
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.toolbarRow}>
          <Pressable
            style={[styles.toolbarButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
            onPress={() => setShowTemplates(true)}
            testID="button-templates"
          >
            <Feather name="layers" size={16} color={Colors.dark.primary} />
            <Text style={[styles.toolbarButtonText, { color: theme.text }]}>Templates</Text>
          </Pressable>

          <Pressable
            style={[styles.toolbarButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
            onPress={() => setShowImport(true)}
            testID="button-import"
          >
            <Feather name="download" size={16} color={Colors.dark.cyan} />
            <Text style={[styles.toolbarButtonText, { color: theme.text }]}>Import</Text>
          </Pressable>

          {editingId ? (
            <Pressable
              style={[styles.toolbarButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              onPress={resetEditor}
              testID="button-new-config"
            >
              <Feather name="plus" size={16} color={Colors.dark.success} />
              <Text style={[styles.toolbarButtonText, { color: theme.text }]}>New</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.editorCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <Text style={[styles.editorLabel, { color: theme.textSecondary }]}>
            {editingId ? 'Edit Configuration' : 'New Configuration'}
          </Text>

          <TextInput
            style={[styles.nameInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="Configuration name..."
            placeholderTextColor={theme.textPlaceholder}
            value={editorName}
            onChangeText={setEditorName}
            testID="input-config-name"
          />

          <TextInput
            style={[styles.contentInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="# SOUL.md content here..."
            placeholderTextColor={theme.textPlaceholder}
            value={editorContent}
            onChangeText={setEditorContent}
            multiline
            textAlignVertical="top"
            testID="input-config-content"
          />

          <View style={styles.editorActions}>
            <Pressable
              style={[
                styles.saveButton,
                { backgroundColor: Colors.dark.primary },
                (!editorName.trim() || !editorContent.trim()) ? styles.disabledButton : null,
              ]}
              onPress={handleSave}
              disabled={!editorName.trim() || !editorContent.trim() || isSaving}
              testID="button-save-config"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="save" size={16} color="#FFF" />
              )}
              <Text style={styles.saveButtonText}>{editingId ? 'Update' : 'Save'}</Text>
            </Pressable>

            {editorContent.trim() ? (
              <Pressable
                style={[styles.exportButton, { borderColor: theme.border }]}
                onPress={() => handleExport(editorContent)}
                testID="button-export-clipboard"
              >
                <Feather name="copy" size={16} color={theme.textSecondary} />
                <Text style={[styles.exportButtonText, { color: theme.textSecondary }]}>Copy</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {editorContent.trim() ? (
          <View style={[styles.previewCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <View style={styles.previewHeader}>
              <Feather name="eye" size={16} color={Colors.dark.primary} />
              <Text style={[styles.previewTitle, { color: theme.text }]}>Preview</Text>
            </View>
            <View style={[styles.previewContent, { backgroundColor: theme.backgroundSecondary }]}>
              {editorContent.split('\n').map((line, i) => {
                let lineStyle = styles.previewLine;
                let lineTextStyle = [styles.previewText, { color: theme.textBase }] as any[];
                if (line.startsWith('# ')) {
                  lineTextStyle = [styles.previewH1, { color: Colors.dark.primary }];
                } else if (line.startsWith('## ')) {
                  lineTextStyle = [styles.previewH2, { color: Colors.dark.cyan }];
                } else if (line.startsWith('- ')) {
                  lineTextStyle = [styles.previewBullet, { color: theme.textBase }];
                }
                return (
                  <Text key={`line-${i}`} style={lineTextStyle}>
                    {line}
                  </Text>
                );
              })}
            </View>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Saved Configurations</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.dark.primary} style={styles.loader} />
        ) : configs.length > 0 ? (
          configs.map((config) => (
            <View
              key={config.id}
              style={[
                styles.configCard,
                { backgroundColor: theme.backgroundDefault, borderColor: config.isActive ? Colors.dark.primary : theme.border },
              ]}
              testID={`config-card-${config.id}`}
            >
              <View style={styles.configHeader}>
                <View style={styles.configTitleRow}>
                  <Text style={[styles.configName, { color: theme.text }]}>{config.name}</Text>
                  {config.isActive ? (
                    <View style={styles.activeBadge}>
                      <Feather name="check-circle" size={12} color={Colors.dark.success} />
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.configDate, { color: theme.textTertiary }]}>
                  {new Date(config.updatedAt).toLocaleDateString()}
                </Text>
              </View>

              <Text
                style={[styles.configPreview, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {config.content}
              </Text>

              <View style={styles.configActions}>
                {!config.isActive ? (
                  <Pressable
                    style={[styles.configActionBtn, { backgroundColor: 'rgba(16,185,129,0.12)' }]}
                    onPress={() => activateMutation.mutate(config.id)}
                    testID={`button-activate-${config.id}`}
                  >
                    <Feather name="power" size={14} color={Colors.dark.success} />
                    <Text style={[styles.configActionText, { color: Colors.dark.success }]}>Activate</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  style={[styles.configActionBtn, { backgroundColor: 'rgba(155,92,255,0.12)' }]}
                  onPress={() => handleEdit(config)}
                  testID={`button-edit-${config.id}`}
                >
                  <Feather name="edit-2" size={14} color={Colors.dark.primary} />
                  <Text style={[styles.configActionText, { color: Colors.dark.primary }]}>Edit</Text>
                </Pressable>

                <Pressable
                  style={[styles.configActionBtn, { backgroundColor: 'rgba(34,211,238,0.12)' }]}
                  onPress={() => handleExport(config.content)}
                  testID={`button-share-${config.id}`}
                >
                  <Feather name="share" size={14} color={Colors.dark.cyan} />
                  <Text style={[styles.configActionText, { color: Colors.dark.cyan }]}>Share</Text>
                </Pressable>

                <Pressable
                  style={[styles.configActionBtn, { backgroundColor: 'rgba(239,68,68,0.12)' }]}
                  onPress={() => handleDelete(config.id)}
                  testID={`button-delete-${config.id}`}
                >
                  <Feather name="trash-2" size={14} color={Colors.dark.error} />
                  <Text style={[styles.configActionText, { color: Colors.dark.error }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="file-text" size={40} color={theme.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Configurations</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Create a SOUL.md configuration to define your agent's personality and behavior.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showTemplates}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTemplates(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Template Gallery</Text>
              <Pressable onPress={() => setShowTemplates(false)} testID="button-close-templates">
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={templates}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.templateCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  onPress={() => handleTemplateSelect(item)}
                  testID={`template-${item.id}`}
                >
                  <Text style={[styles.templateName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.templateDesc, { color: theme.textSecondary }]}>{item.description}</Text>
                </Pressable>
              )}
              contentContainerStyle={styles.templateList}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showImport}
        animationType="slide"
        transparent
        onRequestClose={() => setShowImport(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Import Configuration</Text>
              <Pressable onPress={() => setShowImport(false)} testID="button-close-import">
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={[styles.nameInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
              placeholder="Config name (optional)"
              placeholderTextColor={theme.textPlaceholder}
              value={importName}
              onChangeText={setImportName}
              testID="input-import-name"
            />

            <TextInput
              style={[styles.nameInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
              placeholder="URL to SOUL.md file..."
              placeholderTextColor={theme.textPlaceholder}
              value={importUrl}
              onChangeText={setImportUrl}
              autoCapitalize="none"
              keyboardType="url"
              testID="input-import-url"
            />

            <Pressable
              style={[
                styles.saveButton,
                { backgroundColor: Colors.dark.cyan, marginTop: Spacing.lg },
                !importUrl.trim() ? styles.disabledButton : null,
              ]}
              onPress={() => importMutation.mutate({ name: importName || undefined, url: importUrl })}
              disabled={!importUrl.trim() || importMutation.isPending}
              testID="button-import-submit"
            >
              {importMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="download" size={16} color="#FFF" />
              )}
              <Text style={styles.saveButtonText}>Import</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  toolbarButtonText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  editorCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  editorLabel: {
    ...Typography.small,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  nameInput: {
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.small,
    marginBottom: Spacing.md,
  },
  contentInput: {
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.small,
    minHeight: 200,
    marginBottom: Spacing.md,
  },
  editorActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  saveButtonText: {
    ...Typography.button,
    fontSize: 14,
    color: '#FFF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  exportButtonText: {
    ...Typography.button,
    fontSize: 14,
  },
  previewCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  previewTitle: {
    ...Typography.small,
    fontWeight: '700',
  },
  previewContent: {
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  previewLine: {},
  previewText: {
    ...Typography.small,
    lineHeight: 22,
  },
  previewH1: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  previewH2: {
    ...Typography.h4,
    marginBottom: Spacing.xs,
  },
  previewBullet: {
    ...Typography.small,
    lineHeight: 22,
    paddingLeft: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  loader: {
    marginTop: Spacing['3xl'],
  },
  configCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  configTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  configName: {
    ...Typography.small,
    fontWeight: '700',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.dark.success,
    fontWeight: '600',
    fontSize: 11,
  },
  configDate: {
    ...Typography.caption,
  },
  configPreview: {
    ...Typography.caption,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  configActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  configActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  configActionText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h4,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
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
    ...Typography.h4,
  },
  templateList: {
    gap: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  templateCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  templateName: {
    ...Typography.small,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  templateDesc: {
    ...Typography.caption,
  },
});
