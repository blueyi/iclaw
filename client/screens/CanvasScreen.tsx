import React, { useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  FlatList,
  Platform,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type ViewMode = "canvas" | "scaffold" | "a2ui";

interface SettingsData {
  openclawUrl: string;
  saveMessagesLocally: boolean;
}

interface HistoryEntry {
  id: string;
  mode: ViewMode;
  timestamp: number;
  label: string;
  jsSnippet?: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const VIEW_MODE_CONFIG: { key: ViewMode; label: string; icon: "layout" | "grid" | "cpu" }[] = [
  { key: "canvas", label: "Canvas", icon: "layout" },
  { key: "scaffold", label: "Scaffold", icon: "grid" },
  { key: "a2ui", label: "A2UI", icon: "cpu" },
];

const A2UI_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #070812; color: #F8FAFC; font-family: -apple-system, system-ui, sans-serif; padding: 16px; }
  .a2ui-container { display: flex; flex-direction: column; gap: 12px; }
  .a2ui-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; }
  .a2ui-card h3 { font-size: 14px; color: #9b5cff; margin-bottom: 8px; }
  .a2ui-card p { font-size: 13px; color: #A6B0C3; line-height: 1.5; }
  .a2ui-status { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(16,185,129,0.1); border-radius: 8px; border: 1px solid rgba(16,185,129,0.2); }
  .a2ui-status .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
  .a2ui-status span { font-size: 13px; color: #10b981; }
  #dynamic-area { min-height: 60px; }
</style>
</head>
<body>
<div class="a2ui-container">
  <div class="a2ui-status"><div class="dot"></div><span>A2UI Mode Active</span></div>
  <div class="a2ui-card"><h3>Agent-Driven UI</h3><p>Components rendered here are controlled by the agent. Use the JS input below to inject custom UI elements or run evaluation scripts.</p></div>
  <div id="dynamic-area"></div>
</div>
<script>
  window.addEventListener('message', function(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.type === 'eval') {
        var result = eval(data.code);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'eval-result', result: String(result) }));
      }
    } catch(err) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'eval-error', error: err.message }));
    }
  });
</script>
</body>
</html>
`;

export default function CanvasScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [jsInput, setJsInput] = useState("");
  const [showJsInput, setShowJsInput] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const gatewayUrl = settings?.openclawUrl || "";

  const getCanvasUrl = useCallback(() => {
    if (viewMode === "a2ui") return "";
    const path = viewMode === "scaffold" ? "/__openclaw__/scaffold/" : "/__openclaw__/canvas/";
    return gatewayUrl ? `${gatewayUrl.replace(/\/+$/, "")}${path}` : "";
  }, [viewMode, gatewayUrl]);

  const fullUrl = getCanvasUrl();

  const handleRefresh = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setEvalResult(null);
    webViewRef.current?.reload();
  }, []);

  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setIsLoading(true);
    setHasError(false);
    setEvalResult(null);
  }, []);

  const handleEvalJs = useCallback(() => {
    if (!jsInput.trim()) return;

    if (viewMode === "a2ui") {
      webViewRef.current?.postMessage(JSON.stringify({ type: "eval", code: jsInput }));
    } else {
      webViewRef.current?.injectJavaScript(`
        try { 
          var __result = eval(${JSON.stringify(jsInput)}); 
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'eval-result', result: String(__result) })); 
        } catch(e) { 
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'eval-error', error: e.message })); 
        }
        true;
      `);
    }

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      mode: viewMode,
      timestamp: Date.now(),
      label: jsInput.length > 40 ? jsInput.substring(0, 40) + "..." : jsInput,
      jsSnippet: jsInput,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    setJsInput("");
  }, [jsInput, viewMode]);

  const handleSnapshot = useCallback(async () => {
    const snapshotJs = `
      (function() {
        var html = document.documentElement.outerHTML;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'snapshot', html: html.substring(0, 2000) }));
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(snapshotJs);

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      mode: viewMode,
      timestamp: Date.now(),
      label: "Snapshot captured",
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  }, [viewMode]);

  const handleWebViewMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "eval-result") {
        setEvalResult(`Result: ${data.result}`);
      } else if (data.type === "eval-error") {
        setEvalResult(`Error: ${data.error}`);
      } else if (data.type === "snapshot") {
        await Clipboard.setStringAsync(data.html);
        setEvalResult("Snapshot HTML copied to clipboard");
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleHistoryReplay = useCallback((entry: HistoryEntry) => {
    if (entry.jsSnippet) {
      setJsInput(entry.jsSnippet);
      setShowHistory(false);
      setShowJsInput(true);
    }
  }, []);

  if (!gatewayUrl && viewMode !== "a2ui") {
    return (
      <View style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}>
        <View style={styles.notConnected}>
          <Feather name="wifi-off" size={48} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.notConnectedTitle}>
            Not Connected
          </ThemedText>
          <ThemedText style={styles.notConnectedText}>
            Configure your OpenClaw Gateway URL in Settings to use the Canvas interface, or switch to A2UI mode.
          </ThemedText>
          <View style={styles.notConnectedActions}>
            <Pressable
              style={styles.settingsButton}
              onPress={() => navigation.navigate("Settings")}
              testID="button-canvas-settings"
            >
              <Feather name="settings" size={18} color={Colors.dark.buttonText} />
              <ThemedText style={styles.settingsButtonText}>
                Go to Settings
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.settingsButton, styles.a2uiButton]}
              onPress={() => handleModeChange("a2ui")}
              testID="button-canvas-a2ui-mode"
            >
              <Feather name="cpu" size={18} color={Colors.dark.buttonText} />
              <ThemedText style={styles.settingsButtonText}>
                A2UI Mode
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <View style={styles.modeBar}>
        {VIEW_MODE_CONFIG.map((mode) => (
          <Pressable
            key={mode.key}
            style={[
              styles.modeTab,
              viewMode === mode.key ? styles.modeTabActive : null,
            ]}
            onPress={() => handleModeChange(mode.key)}
            testID={`button-mode-${mode.key}`}
          >
            <Feather
              name={mode.icon}
              size={14}
              color={viewMode === mode.key ? Colors.dark.primary : Colors.dark.textSecondary}
            />
            <ThemedText
              style={[
                styles.modeTabText,
                viewMode === mode.key ? styles.modeTabTextActive : null,
              ]}
            >
              {mode.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={styles.toolbarButton}
          onPress={handleRefresh}
          testID="button-canvas-refresh"
        >
          <Feather name="refresh-cw" size={16} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.urlContainer}>
          <ThemedText style={styles.urlText} numberOfLines={1}>
            {viewMode === "a2ui" ? "a2ui://local" : fullUrl}
          </ThemedText>
        </View>

        <Pressable
          style={[styles.toolbarButton, showJsInput ? styles.toolbarButtonActive : null]}
          onPress={() => { setShowJsInput((v) => !v); setShowHistory(false); }}
          testID="button-canvas-js-toggle"
        >
          <Feather name="terminal" size={16} color={showJsInput ? Colors.dark.primary : Colors.dark.text} />
        </Pressable>

        <Pressable
          style={styles.toolbarButton}
          onPress={handleSnapshot}
          testID="button-canvas-snapshot"
        >
          <Feather name="camera" size={16} color={Colors.dark.text} />
        </Pressable>

        <Pressable
          style={[styles.toolbarButton, showHistory ? styles.toolbarButtonActive : null]}
          onPress={() => { setShowHistory((v) => !v); setShowJsInput(false); }}
          testID="button-canvas-history"
        >
          <Feather name="clock" size={16} color={showHistory ? Colors.dark.primary : Colors.dark.text} />
        </Pressable>

        <View style={styles.statusIndicator}>
          <View
            style={[
              styles.statusDot,
              hasError ? styles.statusError : styles.statusConnected,
            ]}
          />
        </View>
      </View>

      {showJsInput ? (
        <View style={styles.jsInputContainer}>
          <TextInput
            style={styles.jsInputField}
            value={jsInput}
            onChangeText={setJsInput}
            placeholder="Enter JavaScript to evaluate..."
            placeholderTextColor={Colors.dark.textPlaceholder}
            multiline
            testID="input-js-eval"
          />
          <Pressable
            style={styles.jsRunButton}
            onPress={handleEvalJs}
            testID="button-js-run"
          >
            <Feather name="play" size={16} color={Colors.dark.buttonText} />
            <ThemedText style={styles.jsRunText}>Run</ThemedText>
          </Pressable>
          {evalResult ? (
            <View style={styles.evalResultContainer}>
              <ThemedText style={styles.evalResultText} numberOfLines={3}>
                {evalResult}
              </ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}

      {showHistory ? (
        <View style={styles.historyContainer}>
          <ThemedText style={styles.historyTitle}>Canvas History</ThemedText>
          {history.length > 0 ? (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              style={styles.historyList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.historyItem}
                  onPress={() => handleHistoryReplay(item)}
                  testID={`history-item-${item.id}`}
                >
                  <View style={styles.historyItemHeader}>
                    <View style={[styles.historyModeBadge, item.mode === "a2ui" ? styles.historyModeBadgeA2ui : null]}>
                      <ThemedText style={styles.historyModeText}>{item.mode.toUpperCase()}</ThemedText>
                    </View>
                    <ThemedText style={styles.historyTimestamp}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.historyLabel}>{item.label}</ThemedText>
                </Pressable>
              )}
            />
          ) : (
            <ThemedText style={styles.historyEmpty}>No history yet</ThemedText>
          )}
        </View>
      ) : null}

      <View style={styles.webViewContainer}>
        {viewMode === "a2ui" ? (
          <WebView
            ref={webViewRef}
            testID="canvas-webview"
            source={{ html: A2UI_HTML }}
            style={styles.webView}
            onLoadStart={() => { setIsLoading(true); setHasError(false); }}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => { setHasError(true); setIsLoading(false); }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
          />
        ) : (
          <WebView
            ref={webViewRef}
            testID="canvas-webview"
            source={{ uri: fullUrl }}
            style={styles.webView}
            onLoadStart={() => { setIsLoading(true); setHasError(false); }}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => { setHasError(true); setIsLoading(false); }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
          />
        )}

        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <ThemedText style={styles.loadingText}>
              Loading {VIEW_MODE_CONFIG.find((m) => m.key === viewMode)?.label}...
            </ThemedText>
          </View>
        ) : null}

        {hasError ? (
          <View style={styles.errorOverlay}>
            <Feather name="alert-circle" size={48} color={Colors.dark.error} />
            <ThemedText style={styles.errorTitle}>
              Connection Failed
            </ThemedText>
            <ThemedText style={styles.errorText}>
              Could not load the {VIEW_MODE_CONFIG.find((m) => m.key === viewMode)?.label} interface. Check your Gateway URL and try again.
            </ThemedText>
            <Pressable
              style={styles.retryButton}
              onPress={handleRefresh}
              testID="button-canvas-retry"
            >
              <Feather name="refresh-cw" size={18} color={Colors.dark.buttonText} />
              <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modeBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  modeTabActive: {
    backgroundColor: "rgba(155,92,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(155,92,255,0.3)",
  },
  modeTabText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  modeTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundDefault,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  toolbarButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarButtonActive: {
    backgroundColor: "rgba(155,92,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(155,92,255,0.3)",
  },
  urlContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  urlText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  statusIndicator: {
    paddingHorizontal: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusConnected: {
    backgroundColor: Colors.dark.success,
  },
  statusError: {
    backgroundColor: Colors.dark.error,
  },
  jsInputContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  jsInputField: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 13,
    minHeight: 44,
    maxHeight: 88,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  jsRunButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  jsRunText: {
    ...Typography.caption,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  evalResultContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  evalResultText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    color: Colors.dark.cyan,
  },
  historyContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    padding: Spacing.sm,
    maxHeight: 200,
  },
  historyTitle: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  historyList: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  historyItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  historyModeBadge: {
    backgroundColor: "rgba(99,102,241,0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyModeBadgeA2ui: {
    backgroundColor: "rgba(155,92,255,0.15)",
  },
  historyModeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  historyTimestamp: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    fontSize: 10,
  },
  historyLabel: {
    ...Typography.caption,
    color: Colors.dark.text,
  },
  historyEmpty: {
    ...Typography.caption,
    color: Colors.dark.textTertiary,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
    gap: Spacing.md,
  },
  errorTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    ...Typography.button,
    color: Colors.dark.buttonText,
  },
  notConnected: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
    gap: Spacing.md,
  },
  notConnectedTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  notConnectedText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  notConnectedActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  settingsButtonText: {
    ...Typography.button,
    color: Colors.dark.buttonText,
  },
  a2uiButton: {
    backgroundColor: Colors.dark.indigo,
  },
});
