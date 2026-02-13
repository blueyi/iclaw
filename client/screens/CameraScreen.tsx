import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  Platform,
  Linking,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraType, FlashMode } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiRequest } from '@/lib/query-client';

export default function CameraScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });
      if (photo) {
        setCapturedUri(photo.uri);
      }
    } catch {}
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setPrompt('');
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const content = `[Visual Analysis Request] ${prompt || 'Analyze this image'}`;
      await apiRequest('POST', '/api/messages', { content });
      navigation.goBack();
    } catch {
      setSending(false);
    }
  };

  const toggleFlash = () => {
    setFlash((prev: FlashMode) => (prev === 'off' ? 'on' : 'off'));
  };

  const toggleFacing = () => {
    setFacing((prev: CameraType) => (prev === 'back' ? 'front' : 'back'));
  };

  if (!permission) {
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  if (!permission.granted) {
    if (permission.status === 'denied' && !permission.canAskAgain) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
          <Pressable style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Feather name="x" size={24} color={Colors.light.text} />
          </Pressable>
          <Feather name="camera-off" size={48} color={Colors.light.textSecondary} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            Camera permission has been denied. Please enable it in your device settings to use Visual AI.
          </Text>
          {Platform.OS !== 'web' ? (
            <Pressable
              style={styles.permissionButton}
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch {}
              }}
            >
              <LinearGradient
                colors={['#9b5cff', '#6366f1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Feather name="settings" size={18} color="#FFFFFF" />
                <Text style={styles.permissionButtonText}>Open Settings</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Pressable style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Feather name="x" size={24} color={Colors.light.text} />
        </Pressable>
        <Feather name="camera" size={48} color={Colors.light.primary} />
        <Text style={styles.permissionTitle}>Enable Camera</Text>
        <Text style={styles.permissionText}>
          Grant camera access to take photos and send them to AI for visual analysis.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <LinearGradient
            colors={['#9b5cff', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  if (capturedUri) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleRetake} style={styles.headerButton}>
            <Feather name="arrow-left" size={24} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Preview</Text>
          <View style={styles.headerButton} />
        </View>
        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={[styles.previewContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        >
          <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="contain" />
          <View style={styles.promptContainer}>
            <Text style={styles.promptLabel}>Ask about this image (optional)</Text>
            <TextInput
              style={styles.promptInput}
              placeholder="What do you see in this image?"
              placeholderTextColor={Colors.light.textPlaceholder}
              value={prompt}
              onChangeText={setPrompt}
              multiline
              numberOfLines={3}
            />
          </View>
          <View style={styles.previewActions}>
            <Pressable
              testID="button-retake"
              style={styles.retakeButton}
              onPress={handleRetake}
            >
              <Feather name="refresh-cw" size={18} color={Colors.light.text} />
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
            <Pressable
              testID="button-send-visual"
              style={styles.sendButton}
              onPress={handleSend}
              disabled={sending}
            >
              <LinearGradient
                colors={['#9b5cff', '#6366f1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sendGradient}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="send" size={18} color="#FFFFFF" />
                    <Text style={styles.sendText}>Send to AI</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        testID="camera-view"
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
      >
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={[styles.headerTitle, { color: '#FFFFFF' }]}>Visual AI</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={[styles.toolbar, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <Pressable onPress={toggleFlash} style={styles.toolbarButton}>
            <Feather
              name={flash === 'on' ? 'zap' : 'zap-off'}
              size={24}
              color="#FFFFFF"
            />
          </Pressable>

          <Pressable testID="button-capture" onPress={handleCapture} style={styles.captureOuter}>
            <View style={styles.captureInner} />
          </Pressable>

          <Pressable onPress={toggleFacing} style={styles.toolbarButton}>
            <Feather name="refresh-cw" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundRoot,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  camera: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.h4,
    color: Colors.light.text,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.xl,
    left: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  permissionTitle: {
    ...Typography.h3,
    color: Colors.light.text,
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
  permissionText: {
    ...Typography.body,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing['2xl'],
  },
  permissionButton: {
    borderRadius: BorderRadius.button,
    overflow: 'hidden',
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    gap: Spacing.sm,
  },
  permissionButtonText: {
    ...Typography.button,
    color: '#FFFFFF',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing['3xl'],
    paddingTop: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  toolbarButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
  },
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  promptContainer: {
    marginTop: Spacing.xl,
  },
  promptLabel: {
    ...Typography.small,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.sm,
  },
  promptInput: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.light.text,
    ...Typography.body,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  retakeText: {
    ...Typography.button,
    color: Colors.light.text,
  },
  sendButton: {
    flex: 1.5,
    borderRadius: BorderRadius.button,
    overflow: 'hidden',
  },
  sendGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
  },
  sendText: {
    ...Typography.button,
    color: '#FFFFFF',
  },
});
