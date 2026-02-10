import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import clawLogo from '../../assets/images/claw-logo.png';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useTheme';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors, Gradients, Spacing, BorderRadius, Typography } from '@/constants/theme';
import type { RootStackParamList } from '@/navigation/RootStackNavigator';

const PRO_BENEFITS = [
  { icon: 'message-circle' as const, label: 'Unlimited Messages', desc: 'No daily message limits', free: '20/day', pro: 'Unlimited' },
  { icon: 'zap' as const, label: 'Priority AI', desc: 'Faster response times', free: 'Standard', pro: 'Priority' },
  { icon: 'shield' as const, label: 'Advanced Features', desc: 'Access to Pro-only tools', free: 'Basic', pro: 'Full Access' },
  { icon: 'star' as const, label: 'Pro Badge', desc: 'Stand out in the community', free: 'None', pro: 'Gold Badge' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { profile, proThreshold, proUsdValue, remainingMessages, messageLimit, canSendMessage } = useProfile();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleStartChat = () => {
    navigation.navigate('Chat', {});
  };

  const progressTowardsPro = profile 
    ? Math.min((profile.currentTokenBalance / proThreshold) * 100, 100)
    : 0;

  const isPro = profile?.isPro || false;

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
          <Image source={clawLogo} style={styles.welcomeLogo} />
          <Text style={styles.welcomeTitle}>I-CLAW</Text>
          <Text style={styles.welcomeTagline}>Your AI, Mobilized.</Text>
          
          <Pressable 
            style={styles.startButton} 
            onPress={handleStartChat}
            testID="button-start-chat"
          >
            <Feather name="message-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.startButtonText}>Start Chat</Text>
          </Pressable>

          {!isPro && profile ? (
            <View style={styles.usageHint}>
              <Feather name="info" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.usageHintText}>
                {remainingMessages} of {messageLimit} free messages remaining today
              </Text>
            </View>
          ) : null}
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
                {isPro ? (
                  <Feather name="check-circle" size={20} color={Colors.dark.success} />
                ) : (
                  <Text style={[styles.statusValue, { color: theme.text }]}>
                    {Math.round(progressTowardsPro)}%
                  </Text>
                )}
              </View>
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>
                {isPro ? 'Pro Active' : 'To Pro'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[styles.proCompareCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.proCompareHeader}>
          <Feather name="award" size={24} color="#FFD700" />
          <Text style={[styles.proCompareTitle, { color: theme.text }]}>
            {isPro ? 'Your Pro Benefits' : 'Unlock Pro'}
          </Text>
          {isPro ? (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>ACTIVE</Text>
            </View>
          ) : null}
        </View>

        {PRO_BENEFITS.map((benefit, index) => (
          <View key={index} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: isPro ? 'rgba(255, 215, 0, 0.12)' : 'rgba(155, 92, 255, 0.12)' }]}>
              <Feather name={benefit.icon} size={18} color={isPro ? '#FFD700' : Colors.dark.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={[styles.benefitLabel, { color: theme.text }]}>{benefit.label}</Text>
              <Text style={[styles.benefitDesc, { color: theme.textSecondary }]}>{benefit.desc}</Text>
            </View>
            <View style={styles.benefitTier}>
              {isPro ? (
                <Feather name="check" size={18} color={Colors.dark.success} />
              ) : (
                <Text style={[styles.benefitFree, { color: theme.textTertiary }]}>{benefit.free}</Text>
              )}
            </View>
          </View>
        ))}

        {!isPro ? (
          <View style={styles.proUpgradeSection}>
            <View style={[styles.progressBar, { backgroundColor: theme.backgroundSecondary }]}>
              <LinearGradient
                colors={Gradients.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progressTowardsPro}%` }]}
              />
            </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              Pro for $9.99/mo or hold ${`$${proUsdValue}`} in $CLAW for <Text style={{ fontStyle: 'italic', color: '#b44dff' }}>Free Access</Text>
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.featuresCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Text style={[styles.featuresTitle, { color: theme.text }]}>How to Earn $CLAW</Text>
        
        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
            <Feather name="gift" size={20} color="#FFD700" />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>Daily Rewards</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Claim 10+ $CLAW every day with streak bonuses
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Feather name="users" size={20} color="#10B981" />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>Refer Friends</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Earn 100 $CLAW per referral
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(155, 92, 255, 0.15)' }]}>
            <Feather name="shopping-cart" size={20} color={Colors.dark.primary} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureLabel, { color: theme.text }]}>Buy on Bags</Text>
            <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
              Purchase $CLAW tokens on Solana via Bags
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
  welcomeLogo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
  },
  welcomeTitle: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  welcomeTagline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
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
  usageHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  usageHintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
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
  proCompareCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  proCompareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  proCompareTitle: {
    ...Typography.h4,
    flex: 1,
  },
  proBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  proBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: 12,
  },
  benefitTier: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  benefitFree: {
    fontSize: 12,
    fontWeight: '500',
  },
  proUpgradeSection: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
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
