import React, { useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

interface SettingsData {
  openclawUrl: string;
  saveMessagesLocally: boolean;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CanvasScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [useScaffold, setUseScaffold] = useState(false);

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const gatewayUrl = settings?.openclawUrl || "";
  const canvasPath = useScaffold
    ? "/__openclaw__/scaffold/"
    : "/__openclaw__/canvas/";
  const fullUrl = gatewayUrl ? `${gatewayUrl.replace(/\/+$/, "")}${canvasPath}` : "";

  const handleRefresh = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  const handleToggleView = useCallback(() => {
    setUseScaffold((prev) => !prev);
    setIsLoading(true);
    setHasError(false);
  }, []);

  if (!gatewayUrl) {
    return (
      <View style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}>
        <View style={styles.notConnected}>
          <Feather name="wifi-off" size={48} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.notConnectedTitle}>
            Not Connected
          </ThemedText>
          <ThemedText style={styles.notConnectedText}>
            Configure your OpenClaw Gateway URL in Settings to use the Canvas interface.
          </ThemedText>
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
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <View style={styles.toolbar}>
        <Pressable
          style={styles.toolbarButton}
          onPress={handleRefresh}
          testID="button-canvas-refresh"
        >
          <Feather name="refresh-cw" size={18} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.urlContainer}>
          <ThemedText style={styles.urlText} numberOfLines={1}>
            {fullUrl}
          </ThemedText>
        </View>

        <View style={styles.statusIndicator}>
          <View
            style={[
              styles.statusDot,
              hasError ? styles.statusError : styles.statusConnected,
            ]}
          />
          <ThemedText style={styles.statusText}>
            {hasError ? "Error" : isLoading ? "Loading" : "Connected"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          testID="canvas-webview"
          source={{ uri: fullUrl }}
          style={styles.webView}
          onLoadStart={() => {
            setIsLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
        />

        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <ThemedText style={styles.loadingText}>
              Loading Canvas...
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
              Could not load the Canvas interface. Check your Gateway URL and try again.
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

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + Spacing.xl }]}
        onPress={handleToggleView}
        testID="button-canvas-toggle"
      >
        <Feather
          name={useScaffold ? "layout" : "grid"}
          size={22}
          color={Colors.dark.buttonText}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  toolbarButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  urlContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  urlText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
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
  statusText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
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
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  settingsButtonText: {
    ...Typography.button,
    color: Colors.dark.buttonText,
  },
  fab: {
    position: "absolute",
    right: Spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
});
