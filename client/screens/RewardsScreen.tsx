import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useProfile } from '@/contexts/ProfileContext';
import { useTheme } from '@/hooks/useTheme';
import { Colors, Gradients, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { getApiUrl } from '@/lib/query-client';

interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalEarned: number;
}

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { 
    profile, 
    streak, 
    canClaimDailyReward, 
    proThreshold,
    proUsdValue,
    isLoading, 
    claimDailyReward,
    refreshProfile 
  } = useProfile();
  
  const [claiming, setClaiming] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);

  const loadReferralStats = useCallback(async () => {
    if (!profile) return;
    try {
      const response = await fetch(new URL(`/api/referrals/${profile.id}`, getApiUrl()).toString());
      if (response.ok) {
        const data = await response.json();
        setReferralStats(data);
      }
    } catch (error) {
      console.error('Error loading referral stats:', error);
    }
  }, [profile]);

  useEffect(() => {
    loadReferralStats();
  }, [loadReferralStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadReferralStats()]);
    setRefreshing(false);
  };

  const handleClaim = async () => {
    if (!canClaimDailyReward || claiming) return;
    
    setClaiming(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    const result = await claimDailyReward();
    
    if (result) {
      setClaimedAmount(result.tokensEarned);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setClaimedAmount(null), 3000);
    }
    
    setClaiming(false);
  };

  const handleCopyCode = async () => {
    if (profile?.referralCode) {
      await Clipboard.setStringAsync(profile.referralCode);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handleShare = async () => {
    if (!profile?.referralCode) return;
    
    try {
      await Share.share({
        message: `Join I-Claw and get 50 $CLAW tokens! Use my referral code: ${profile.referralCode}\n\nDownload now: https://i-claw.com`,
        title: 'Join I-Claw',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const progressTowardsPro = profile 
    ? Math.min((profile.currentTokenBalance / proThreshold) * 100, 100)
    : 0;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.link} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.link} />
      }
    >
      <View style={styles.balanceCard}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceGradient}
        >
          <Text style={styles.balanceLabel}>Your $CLAW Balance</Text>
          <Text style={styles.balanceAmount}>{profile?.currentTokenBalance?.toLocaleString() || 0}</Text>
          <View style={styles.balanceStats}>
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatValue}>{profile?.totalTokensEarned?.toLocaleString() || 0}</Text>
              <Text style={styles.balanceStatLabel}>Total Earned</Text>
            </View>
            <View style={styles.balanceStatDivider} />
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatValue}>{streak?.currentStreak || 0}</Text>
              <Text style={styles.balanceStatLabel}>Day Streak</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.proCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.proHeader}>
          <Feather name="award" size={24} color="#FFD700" />
          <Text style={[styles.proTitle, { color: theme.text }]}>Pro Status</Text>
          {profile?.isPro ? (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>ACTIVE</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.proDescription, { color: theme.textSecondary }]}>
          {profile?.isPro 
            ? 'You have Pro access! Enjoy unlimited messages and priority AI.'
            : null
          }
          {!profile?.isPro ? (
            <>Pro-Features for $9.99/mo, or hold ${proUsdValue} in $CLAW for <Text style={{ fontStyle: 'italic', color: '#b44dff' }}>Free Access</Text></>
          ) : null}
        </Text>
        {!profile?.isPro ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.backgroundSecondary }]}>
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progressTowardsPro}%` }]}
              />
            </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              {profile?.currentTokenBalance || 0} $CLAW
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.dailyCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.dailyHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Daily Reward</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              {canClaimDailyReward 
                ? 'Claim your tokens!' 
                : 'Come back tomorrow'
              }
            </Text>
          </View>
          <View style={styles.streakBadge}>
            <Feather name="zap" size={16} color="#FFD700" />
            <Text style={styles.streakText}>{streak?.currentStreak || 0}</Text>
          </View>
        </View>

        {claimedAmount !== null ? (
          <View style={styles.claimedMessage}>
            <Feather name="check-circle" size={24} color={Colors.dark.success} />
            <Text style={[styles.claimedText, { color: Colors.dark.success }]}>
              +{claimedAmount} $CLAW earned!
            </Text>
          </View>
        ) : (
          <Pressable
            style={[
              styles.claimButton,
              !canClaimDailyReward && styles.claimButtonDisabled,
            ]}
            onPress={handleClaim}
            disabled={!canClaimDailyReward || claiming}
            testID="button-claim-daily"
          >
            <LinearGradient
              colors={canClaimDailyReward ? ['#FFD700', '#FFA500'] : [theme.backgroundSecondary, theme.backgroundSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.claimButtonGradient}
            >
              {claiming ? (
                <ActivityIndicator size="small" color={canClaimDailyReward ? '#000' : theme.textSecondary} />
              ) : (
                <>
                  <Feather 
                    name="gift" 
                    size={20} 
                    color={canClaimDailyReward ? '#000' : theme.textSecondary} 
                  />
                  <Text style={[
                    styles.claimButtonText,
                    { color: canClaimDailyReward ? '#000' : theme.textSecondary }
                  ]}>
                    {canClaimDailyReward ? 'Claim Daily Reward' : 'Already Claimed'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        )}

        <View style={styles.rewardInfo}>
          <View style={styles.rewardInfoItem}>
            <Text style={[styles.rewardInfoLabel, { color: theme.textSecondary }]}>Base Reward</Text>
            <Text style={[styles.rewardInfoValue, { color: theme.text }]}>10 $CLAW</Text>
          </View>
          <View style={styles.rewardInfoItem}>
            <Text style={[styles.rewardInfoLabel, { color: theme.textSecondary }]}>Streak Bonus</Text>
            <Text style={[styles.rewardInfoValue, { color: '#FFD700' }]}>
              x{Math.min(Math.floor((streak?.currentStreak || 0) / 7) + 1, 5)}
            </Text>
          </View>
          <View style={styles.rewardInfoItem}>
            <Text style={[styles.rewardInfoLabel, { color: theme.textSecondary }]}>Longest Streak</Text>
            <Text style={[styles.rewardInfoValue, { color: theme.text }]}>{streak?.longestStreak || 0} days</Text>
          </View>
        </View>
      </View>

      <View style={[styles.referralCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Invite Friends</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Earn 100 $CLAW for each friend who joins!
        </Text>

        <View style={[styles.referralCodeBox, { backgroundColor: theme.backgroundSecondary }]}>
          <Text style={[styles.referralCodeLabel, { color: theme.textSecondary }]}>Your Referral Code</Text>
          <View style={styles.referralCodeRow}>
            <Text style={[styles.referralCode, { color: theme.text }]}>
              {profile?.referralCode || '--------'}
            </Text>
            <Pressable onPress={handleCopyCode} style={styles.copyButton} testID="button-copy-code">
              <Feather name="copy" size={20} color={theme.link} />
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.shareButton} onPress={handleShare} testID="button-share-referral">
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shareButtonGradient}
          >
            <Feather name="share-2" size={20} color="#FFF" />
            <Text style={styles.shareButtonText}>Share Invite Link</Text>
          </LinearGradient>
        </Pressable>

        {referralStats ? (
          <View style={styles.referralStats}>
            <View style={styles.referralStat}>
              <Text style={[styles.referralStatValue, { color: theme.text }]}>
                {referralStats.completedReferrals}
              </Text>
              <Text style={[styles.referralStatLabel, { color: theme.textSecondary }]}>
                Friends Joined
              </Text>
            </View>
            <View style={styles.referralStat}>
              <Text style={[styles.referralStatValue, { color: theme.text }]}>
                {referralStats.pendingReferrals}
              </Text>
              <Text style={[styles.referralStatLabel, { color: theme.textSecondary }]}>
                Pending
              </Text>
            </View>
            <View style={styles.referralStat}>
              <Text style={[styles.referralStatValue, { color: '#FFD700' }]}>
                {referralStats.totalEarned}
              </Text>
              <Text style={[styles.referralStatLabel, { color: theme.textSecondary }]}>
                $CLAW Earned
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  balanceCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  balanceGradient: {
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  balanceAmount: {
    color: '#FFF',
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -2,
  },
  balanceStats: {
    flexDirection: 'row',
    marginTop: Spacing.xl,
    gap: Spacing['2xl'],
  },
  balanceStat: {
    alignItems: 'center',
  },
  balanceStatValue: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  balanceStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  balanceStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  proCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  proHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  proTitle: {
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
  proDescription: {
    ...Typography.small,
    marginBottom: Spacing.md,
  },
  progressContainer: {
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
    textAlign: 'right',
  },
  dailyCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  dailyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: 4,
  },
  sectionSubtitle: {
    ...Typography.small,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  streakText: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 16,
  },
  claimedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  claimedText: {
    fontSize: 18,
    fontWeight: '700',
  },
  claimButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  claimButtonDisabled: {
    opacity: 0.7,
  },
  claimButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  claimButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  rewardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  rewardInfoItem: {
    alignItems: 'center',
  },
  rewardInfoLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  rewardInfoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  referralCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  referralCodeBox: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  referralCodeLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referralCode: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  copyButton: {
    padding: Spacing.sm,
  },
  shareButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  shareButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  referralStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  referralStat: {
    alignItems: 'center',
  },
  referralStatValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  referralStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
});
