import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useTheme';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors, Gradients, Spacing, BorderRadius, Typography } from '@/constants/theme';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { profile, proThreshold } = useProfile();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleStartChat = () => {
    navigation.navigate('Chat', {});
  };

  const progressTowardsPro = profile 
    ? Math.min((profile.currentTokenBalance / proThreshold) * 100, 100)
    : 0;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.welcomeCard}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeGradient}
        >
          <Feather name="cpu" size={40} color="#FFF" />
          <Text style={styles.welcomeTitle}>OpenClaw AI</Text>
          <Text style={styles.welcomeSubtitle}>
            Your intelligent assistant powered by OpenClaw Gateway
          </Text>
          
          <Pressable 
            style={styles.startButton} 
            onPress={handleStartChat}
            testID="button-start-chat"
          >
            <Feather name="message-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.startButtonText}>Start Chat</Text>
          </Pressable>
        </LinearGradient>
      </View>

      {profile ? (
        <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={[styles.statusValue, { color: '#FFD700' }]}>
                {profile.currentTokenBalance?.toLocaleString() || 0}
              </Text>
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>
                $CLAW Balance
              </Text>
            </View>
            <View style={[styles.statusDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statusItem}>
              <View style={styles.proStatusRow}>
                {profile.isPro ? (
                  <Feather name="check-circle" size={20} color={Colors.dark.success} />
                ) : (
                  <Text style={[styles.statusValue, { color: theme.text }]}>
                    {Math.round(progressTowardsPro)}%
                  </Text>
                )}
              </View>
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>
                {profile.isPro ? 'Pro Active' : 'To Pro'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[styles.featuresCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Text style={[styles.featuresTitle, { color: theme.text }]}>Features</Text>
        
        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(155, 92, 255, 0.15)' }]}>
            <Feather name="zap" size={20} color={Colors.dark.primary} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>AI Assistant</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Powered by OpenClaw Gateway
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
            <Feather name="gift" size={20} color="#FFD700" />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>Daily Rewards</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Earn $CLAW tokens daily
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Feather name="users" size={20} color="#10B981" />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>Referral Program</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Invite friends, earn more
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
            <Feather name="award" size={20} color="#EC4899" />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>Pro Access</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Hold 1,000+ $CLAW for Pro
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  welcomeCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  welcomeGradient: {
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  welcomeTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  welcomeSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFF',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: BorderRadius.full,
  },
  startButtonText: {
    color: Colors.dark.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  statusCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
  },
  statusValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statusLabel: {
    ...Typography.caption,
    marginTop: 4,
  },
  statusDivider: {
    width: 1,
    height: 40,
  },
  proStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featuresCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  featuresTitle: {
    ...Typography.h4,
    marginBottom: Spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureLabel: {
    ...Typography.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  featureDescription: {
    ...Typography.caption,
  },
});
