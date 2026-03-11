import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";

import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useTheme } from "@/hooks/useTheme";

const COUNCIL_PASSWORD_KEY = "council_room_password";

interface MemberReview {
  member: string;
  role: string;
  model: string;
  score: number;
  summary: string;
  strengths: string[];
  optimizations: string[];
  status: string;
}

interface CouncilReview {
  id: string;
  timestamp: string;
  reviews: MemberReview[];
  averageScore: number;
  topOptimizations: string[];
  snapshot: Record<string, any>;
}

interface CouncilStatus {
  isRunning: boolean;
  config: { enabled: boolean; intervalHours: number; useGateway: boolean };
  lastReview: CouncilReview | null;
  totalReviews: number;
}

const MEMBER_COLORS: Record<string, string> = {
  "Neo": "#9b5cff",
  "Morpheus": "#22d3ee",
  "The Oracle": "#F59E0B",
  "Agent Smith": "#EF4444",
};

const MEMBER_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  "Neo": "zap",
  "Morpheus": "users",
  "The Oracle": "eye",
  "Agent Smith": "shield",
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 8 ? "#10b981" : score >= 6 ? "#F59E0B" : "#EF4444";
  return (
    <View style={[styles.scoreRing, { borderColor: color }]}>
      <Text style={[styles.scoreNumber, { color }]}>{score}</Text>
      <Text style={[styles.scoreDenom, { color }]}>/10</Text>
    </View>
  );
}

function MemberCard({ review }: { review: MemberReview }) {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useTheme();
  const color = MEMBER_COLORS[review.member] || Colors.dark.primary;
  const icon = MEMBER_ICONS[review.member] || "user";

  return (
    <Pressable
      style={[styles.memberCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
      onPress={() => setExpanded(e => !e)}
    >
      <View style={styles.memberCardHeader}>
        <View style={[styles.memberIconWrap, { backgroundColor: `${color}20` }]}>
          <Feather name={icon} size={18} color={color} />
        </View>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: theme.text }]}>{review.member}</Text>
          <Text style={[styles.memberRole, { color: theme.textTertiary }]}>{review.role}</Text>
          <Text style={[styles.memberModel, { color: color }]}>
            {review.model === "Gateway AI" ? "⚡ AI Review" : "◆ Heuristic"}
          </Text>
        </View>
        <ScoreRing score={review.score} />
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={theme.textTertiary} style={{ marginLeft: 8 }} />
      </View>

      {expanded && (
        <View style={styles.memberCardBody}>
          <Text style={[styles.memberSummary, { color: theme.textSecondary }]}>{review.summary}</Text>

          {review.strengths.length > 0 && (
            <View style={styles.feedbackSection}>
              <Text style={[styles.feedbackLabel, { color: "#10b981" }]}>STRENGTHS</Text>
              {review.strengths.map((s, i) => (
                <View key={i} style={styles.feedbackRow}>
                  <Feather name="check-circle" size={13} color="#10b981" style={{ marginTop: 2 }} />
                  <Text style={[styles.feedbackText, { color: theme.textSecondary }]}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {review.optimizations.length > 0 && (
            <View style={styles.feedbackSection}>
              <Text style={[styles.feedbackLabel, { color: "#F59E0B" }]}>OPTIMIZATIONS</Text>
              {review.optimizations.map((o, i) => (
                <View key={i} style={styles.feedbackRow}>
                  <Feather name="arrow-up-circle" size={13} color="#F59E0B" style={{ marginTop: 2 }} />
                  <Text style={[styles.feedbackText, { color: theme.textSecondary }]}>{o}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

function PasswordGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"enter" | "create" | "confirm">("enter");
  const [input, setInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();

  React.useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(COUNCIL_PASSWORD_KEY);
      if (!stored) setMode("create");
    })();
  }, []);

  const handleEnter = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const stored = await SecureStore.getItemAsync(COUNCIL_PASSWORD_KEY);
      if (stored === input.trim()) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAuthenticated();
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError("Incorrect password");
        setInput("");
      }
    } catch {
      setError("Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (input.trim().length < 4) { setError("Password must be at least 4 characters"); return; }
    if (mode === "create") { setMode("confirm"); setConfirmInput(""); return; }
    if (confirmInput !== input) { setError("Passwords do not match"); setConfirmInput(""); return; }
    setLoading(true);
    try {
      await SecureStore.setItemAsync(COUNCIL_PASSWORD_KEY, input.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAuthenticated();
    } catch {
      setError("Failed to save password");
    } finally {
      setLoading(false);
    }
  };

  const isCreating = mode === "create" || mode === "confirm";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.gateContainer}>
      <View style={styles.gateLockWrap}>
        <View style={styles.gateLockIcon}>
          <Feather name="lock" size={32} color={Colors.dark.primary} />
        </View>
        <Text style={styles.gateTitle}>Council Room</Text>
        <Text style={styles.gateSubtitle}>
          {mode === "create" ? "Create your private access password" :
           mode === "confirm" ? "Confirm your password" :
           "Enter your password to continue"}
        </Text>
      </View>

      <View style={styles.gateInputWrap}>
        <TextInput
          style={styles.gateInput}
          placeholder={mode === "confirm" ? "Confirm password" : "Password"}
          placeholderTextColor={Colors.dark.textTertiary}
          secureTextEntry
          value={mode === "confirm" ? confirmInput : input}
          onChangeText={mode === "confirm" ? setConfirmInput : setInput}
          onSubmitEditing={isCreating ? handleCreate : handleEnter}
          autoFocus
          returnKeyType="done"
        />
        {error ? <Text style={styles.gateError}>{error}</Text> : null}
      </View>

      <Pressable
        style={[styles.gateButton, loading && { opacity: 0.6 }]}
        onPress={isCreating ? handleCreate : handleEnter}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.gateButtonText}>
            {mode === "create" ? "Continue" : mode === "confirm" ? "Set Password" : "Enter"}
          </Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

export default function CouncilScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<"review" | "history" | "settings">("review");
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: status, isLoading: statusLoading } = useQuery<CouncilStatus>({
    queryKey: ["/api/council/status"],
    enabled: authenticated,
    refetchInterval: 5000,
  });

  const { data: history = [] } = useQuery<CouncilReview[]>({
    queryKey: ["/api/council/history"],
    enabled: authenticated && activeTab === "history",
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/council/run");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to run review");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/council/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/council/history"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Alert.alert("Review Failed", err.message);
    },
  });

  const configMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await apiRequest("PUT", "/api/council/config", updates);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/council/status"] }),
  });

  const handleChangePassword = async () => {
    if (newPassword.length < 4) { Alert.alert("Too short", "Password must be at least 4 characters"); return; }
    if (newPassword !== confirmPassword) { Alert.alert("Mismatch", "Passwords do not match"); return; }
    await SecureStore.setItemAsync(COUNCIL_PASSWORD_KEY, newPassword);
    setNewPassword("");
    setConfirmPassword("");
    setChangingPassword(false);
    Alert.alert("Done", "Password updated");
  };

  const lastReview = status?.lastReview;
  const isRunning = status?.isRunning || runMutation.isPending;

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (!authenticated) {
    return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundDefault }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl + (Platform.OS === "web" ? 34 : 0),
          paddingHorizontal: Spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <View style={styles.headerCardTop}>
            <View style={styles.headerCardLeft}>
              <View style={styles.councilIconWrap}>
                <Feather name="users" size={20} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={[styles.headerCardTitle, { color: theme.text }]}>AI Council</Text>
                <Text style={[styles.headerCardSub, { color: theme.textTertiary }]}>
                  {status?.totalReviews || 0} reviews conducted
                </Text>
              </View>
            </View>
            {lastReview && (
              <View style={[styles.scoreBadge, { borderColor: Colors.dark.primary }]}>
                <Text style={[styles.scoreBadgeNum, { color: Colors.dark.primary }]}>
                  {lastReview.averageScore}
                </Text>
                <Text style={[styles.scoreBadgeLabel, { color: theme.textTertiary }]}>avg score</Text>
              </View>
            )}
          </View>

          {lastReview && (
            <Text style={[styles.lastRunText, { color: theme.textTertiary }]}>
              Last review: {formatDate(lastReview.timestamp)}
            </Text>
          )}

          <Pressable
            style={[styles.runButton, isRunning && styles.runButtonActive]}
            onPress={() => runMutation.mutate()}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.runButtonText}>Council Reviewing…</Text>
              </>
            ) : (
              <>
                <Feather name="play-circle" size={18} color="#fff" />
                <Text style={styles.runButtonText}>Run Review Now</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          {(["review", "history", "settings"] as const).map(tab => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && { borderBottomColor: Colors.dark.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? Colors.dark.primary : theme.textTertiary }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Review Tab */}
        {activeTab === "review" && (
          <>
            {isRunning && (
              <View style={[styles.runningBanner, { backgroundColor: `${Colors.dark.primary}20` }]}>
                <ActivityIndicator size="small" color={Colors.dark.primary} />
                <Text style={[styles.runningText, { color: Colors.dark.primary }]}>
                  Council members are analyzing the app…
                </Text>
              </View>
            )}

            {lastReview ? (
              <>
                {lastReview.topOptimizations.length > 0 && (
                  <View style={[styles.topOptsCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
                    <View style={styles.topOptsHeader}>
                      <Feather name="trending-up" size={16} color="#F59E0B" />
                      <Text style={[styles.topOptsTitle, { color: theme.text }]}>Top Optimizations</Text>
                    </View>
                    {lastReview.topOptimizations.map((opt, i) => (
                      <View key={i} style={styles.topOptRow}>
                        <Text style={[styles.topOptNum, { color: Colors.dark.primary }]}>{i + 1}</Text>
                        <Text style={[styles.topOptText, { color: theme.textSecondary }]}>{opt}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>COUNCIL MEMBERS</Text>
                {lastReview.reviews.map(review => (
                  <MemberCard key={review.member} review={review} />
                ))}

                <View style={[styles.snapshotCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
                  <Text style={[styles.snapshotTitle, { color: theme.textTertiary }]}>SNAPSHOT</Text>
                  {Object.entries(lastReview.snapshot).map(([k, v]) => (
                    <View key={k} style={styles.snapshotRow}>
                      <Text style={[styles.snapshotKey, { color: theme.textSecondary }]}>
                        {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                      </Text>
                      <Text style={[styles.snapshotValue, { color: theme.text }]}>{String(v)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : !isRunning ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={40} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Reviews Yet</Text>
                <Text style={[styles.emptyDesc, { color: theme.textTertiary }]}>
                  Run a review to get feedback from the AI Council on your app.
                </Text>
              </View>
            ) : null}
          </>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <>
            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="clock" size={40} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No History</Text>
                <Text style={[styles.emptyDesc, { color: theme.textTertiary }]}>Reviews will appear here after you run them.</Text>
              </View>
            ) : (
              history.map((r, i) => (
                <View key={r.id} style={[styles.historyItem, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
                  <View style={styles.historyItemLeft}>
                    <Text style={[styles.historyDate, { color: theme.text }]}>{formatDate(r.timestamp)}</Text>
                    <Text style={[styles.historyDetails, { color: theme.textTertiary }]}>
                      {r.reviews.length} members · {r.topOptimizations.length} optimizations
                    </Text>
                  </View>
                  <View style={[styles.historyScore, { borderColor: r.averageScore >= 8 ? "#10b981" : r.averageScore >= 6 ? "#F59E0B" : "#EF4444" }]}>
                    <Text style={[styles.historyScoreNum, { color: r.averageScore >= 8 ? "#10b981" : r.averageScore >= 6 ? "#F59E0B" : "#EF4444" }]}>
                      {r.averageScore}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <>
            <View style={[styles.settingsCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <Text style={[styles.settingsCardTitle, { color: theme.text }]}>Auto-Review Schedule</Text>

              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: theme.textSecondary }]}>Auto-run enabled</Text>
                <Pressable
                  style={[styles.toggle, { backgroundColor: status?.config.enabled ? Colors.dark.primary : theme.border }]}
                  onPress={() => configMutation.mutate({ enabled: !status?.config.enabled })}
                >
                  <View style={[styles.toggleKnob, { left: status?.config.enabled ? 20 : 2 }]} />
                </Pressable>
              </View>

              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: theme.textSecondary }]}>Use gateway AI</Text>
                <Pressable
                  style={[styles.toggle, { backgroundColor: status?.config.useGateway ? Colors.dark.primary : theme.border }]}
                  onPress={() => configMutation.mutate({ useGateway: !status?.config.useGateway })}
                >
                  <View style={[styles.toggleKnob, { left: status?.config.useGateway ? 20 : 2 }]} />
                </Pressable>
              </View>

              <View style={styles.settingsRow}>
                <Text style={[styles.settingsLabel, { color: theme.textSecondary }]}>Interval (hours)</Text>
                <View style={styles.intervalButtons}>
                  {[6, 12, 24, 48].map(h => (
                    <Pressable
                      key={h}
                      style={[styles.intervalBtn, status?.config.intervalHours === h && styles.intervalBtnActive]}
                      onPress={() => configMutation.mutate({ intervalHours: h })}
                    >
                      <Text style={[styles.intervalBtnText, status?.config.intervalHours === h && { color: "#fff" }]}>{h}h</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <Text style={[styles.settingsCardTitle, { color: theme.text }]}>Access Password</Text>

              {changingPassword ? (
                <>
                  <TextInput
                    style={[styles.pwInput, { color: theme.text, borderColor: theme.border }]}
                    placeholder="New password (min 4 chars)"
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TextInput
                    style={[styles.pwInput, { color: theme.text, borderColor: theme.border, marginTop: Spacing.sm }]}
                    placeholder="Confirm new password"
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <View style={styles.pwButtons}>
                    <Pressable style={styles.pwCancel} onPress={() => setChangingPassword(false)}>
                      <Text style={[styles.pwCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.pwSave} onPress={handleChangePassword}>
                      <Text style={styles.pwSaveText}>Save Password</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable style={styles.changePwBtn} onPress={() => setChangingPassword(true)}>
                  <Feather name="key" size={16} color={Colors.dark.primary} />
                  <Text style={[styles.changePwText, { color: Colors.dark.primary }]}>Change Password</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gateContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  gateLockWrap: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  gateLockIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
  },
  gateTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  gateSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  gateInputWrap: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  gateInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 4,
  },
  gateError: {
    color: "#EF4444",
    textAlign: "center",
    marginTop: Spacing.sm,
    fontSize: 13,
  },
  gateButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    width: "100%",
    alignItems: "center",
  },
  gateButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  headerCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  headerCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  councilIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCardTitle: {
    ...Typography.h4,
  },
  headerCardSub: {
    ...Typography.caption,
  },
  scoreBadge: {
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
    alignItems: "center",
    minWidth: 52,
  },
  scoreBadgeNum: {
    fontSize: 20,
    fontWeight: "700",
  },
  scoreBadgeLabel: {
    ...Typography.caption,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  lastRunText: {
    ...Typography.caption,
    marginBottom: Spacing.md,
  },
  runButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  runButtonActive: {
    opacity: 0.8,
  },
  runButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  tabs: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  runningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  runningText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  topOptsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  topOptsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  topOptsTitle: {
    ...Typography.small,
    fontWeight: "700",
  },
  topOptRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  topOptNum: {
    fontWeight: "700",
    fontSize: 13,
    width: 16,
  },
  topOptText: {
    flex: 1,
    ...Typography.caption,
    lineHeight: 18,
  },
  sectionLabel: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  memberCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  memberCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  memberIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...Typography.small,
    fontWeight: "700",
  },
  memberRole: {
    ...Typography.caption,
    fontSize: 11,
  },
  memberModel: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  scoreRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: {
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 16,
  },
  scoreDenom: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
  },
  memberCardBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: `${Colors.dark.border}60`,
  },
  memberSummary: {
    ...Typography.caption,
    lineHeight: 18,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  feedbackSection: {
    marginBottom: Spacing.sm,
  },
  feedbackLabel: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    fontSize: 10,
  },
  feedbackRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: 4,
  },
  feedbackText: {
    flex: 1,
    ...Typography.caption,
    lineHeight: 17,
    fontSize: 12,
  },
  snapshotCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  snapshotTitle: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    fontSize: 10,
  },
  snapshotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  snapshotKey: {
    ...Typography.caption,
    flex: 1,
  },
  snapshotValue: {
    ...Typography.caption,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h4,
  },
  emptyDesc: {
    ...Typography.caption,
    textAlign: "center",
    lineHeight: 18,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  historyItemLeft: {
    flex: 1,
  },
  historyDate: {
    ...Typography.small,
    fontWeight: "600",
  },
  historyDetails: {
    ...Typography.caption,
    marginTop: 2,
  },
  historyScore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  historyScoreNum: {
    fontWeight: "700",
    fontSize: 14,
  },
  settingsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  settingsCardTitle: {
    ...Typography.small,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  settingsLabel: {
    ...Typography.body,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    position: "relative",
  },
  toggleKnob: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  intervalButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  intervalBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  intervalBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  intervalBtnText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  changePwBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  changePwText: {
    ...Typography.body,
    fontWeight: "600",
  },
  pwInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
  },
  pwButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pwCancel: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pwCancelText: {
    fontWeight: "600",
  },
  pwSave: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
  },
  pwSaveText: {
    color: "#fff",
    fontWeight: "600",
  },
});
