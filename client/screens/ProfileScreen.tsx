import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useTheme';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors, Gradients, Spacing, BorderRadius, Typography } from '@/constants/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { profile, isLoading, connectWallet, refreshProfile, proThreshold } = useProfile();
  
  const [walletInput, setWalletInput] = useState('');
  const [showWalletInput, setShowWalletInput] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnectWallet = async () => {
    if (!walletInput.trim()) return;
    
    setConnecting(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    await connectWallet(walletInput.trim());
    setShowWalletInput(false);
    setWalletInput('');
    setConnecting(false);
  };

  const handlePhantomConnect = async () => {
    const phantomUrl = 'https://phantom.app';
    try {
      await Linking.openURL(phantomUrl);
    } catch {
      if (Platform.OS === 'web') {
        window.open(phantomUrl, '_blank');
      }
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
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Feather name="credit-card" size={24} color={theme.link} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Wallet</Text>
        </View>
        
        {profile?.walletAddress ? (
          <View>
            <Text style={[styles.walletLabel, { color: theme.textSecondary }]}>
              Connected Wallet
            </Text>
            <Text style={[styles.walletAddress, { color: theme.text }]} numberOfLines={1} ellipsizeMode="middle">
              {profile.walletAddress}
            </Text>
            <Pressable 
              style={[styles.disconnectButton, { borderColor: theme.border }]}
              onPress={() => setShowWalletInput(true)}
            >
              <Text style={[styles.disconnectText, { color: theme.textSecondary }]}>
                Change Wallet
              </Text>
            </Pressable>
          </View>
        ) : showWalletInput ? (
          <View style={styles.walletInputContainer}>
            <TextInput
              style={[styles.walletInput, { 
                backgroundColor: theme.backgroundSecondary, 
                color: theme.text,
                borderColor: theme.border,
              }]}
              placeholder="Enter Solana wallet address"
              placeholderTextColor={theme.textTertiary}
              value={walletInput}
              onChangeText={setWalletInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.walletInputButtons}>
              <Pressable 
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setShowWalletInput(false);
                  setWalletInput('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={styles.connectButton}
                onPress={handleConnectWallet}
                disabled={connecting}
              >
                <LinearGradient
                  colors={Gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.connectButtonGradient}
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.connectButtonText}>Connect</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ) : (
          <View>
            <Text style={[styles.walletDescription, { color: theme.textSecondary }]}>
              Connect your Solana wallet to check your $CLAW balance and unlock Pro features.
            </Text>
            <Pressable 
              style={styles.phantomButton}
              onPress={() => setShowWalletInput(true)}
              testID="button-connect-wallet"
            >
              <LinearGradient
                colors={['#AB9FF2', '#7B3FE4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.phantomButtonGradient}
              >
                <Text style={styles.phantomButtonText}>Enter Wallet Address</Text>
              </LinearGradient>
            </Pressable>
            <Pressable 
              style={[styles.getPhantomButton, { borderColor: theme.border }]}
              onPress={handlePhantomConnect}
            >
              <Text style={[styles.getPhantomText, { color: theme.link }]}>
                Don't have a wallet? Get Phantom
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Feather name="award" size={24} color="#FFD700" />
          <Text style={[styles.cardTitle, { color: theme.text }]}>$CLAW Status</Text>
          {profile?.isPro ? (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          ) : null}
        </View>
        
        <View style={styles.tokenStats}>
          <View style={styles.tokenStat}>
            <Text style={[styles.tokenStatValue, { color: theme.text }]}>
              {profile?.currentTokenBalance?.toLocaleString() || 0}
            </Text>
            <Text style={[styles.tokenStatLabel, { color: theme.textSecondary }]}>
              Balance
            </Text>
          </View>
          <View style={[styles.tokenStatDivider, { backgroundColor: theme.border }]} />
          <View style={styles.tokenStat}>
            <Text style={[styles.tokenStatValue, { color: theme.text }]}>
              {profile?.totalTokensEarned?.toLocaleString() || 0}
            </Text>
            <Text style={[styles.tokenStatLabel, { color: theme.textSecondary }]}>
              Total Earned
            </Text>
          </View>
        </View>

        {!profile?.isPro ? (
          <View style={styles.proProgress}>
            <View style={styles.proProgressHeader}>
              <Text style={[styles.proProgressLabel, { color: theme.textSecondary }]}>
                Progress to Pro
              </Text>
              <Text style={[styles.proProgressValue, { color: theme.text }]}>
                {profile?.currentTokenBalance || 0} / {proThreshold.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.backgroundSecondary }]}>
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progressTowardsPro}%` }]}
              />
            </View>
            <Text style={[styles.proHint, { color: theme.textTertiary }]}>
              Hold {proThreshold.toLocaleString()} $CLAW to unlock Pro features
            </Text>
          </View>
        ) : (
          <View style={styles.proActive}>
            <Feather name="check-circle" size={20} color={Colors.dark.success} />
            <Text style={[styles.proActiveText, { color: Colors.dark.success }]}>
              Pro features unlocked
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Feather name="shopping-cart" size={24} color={theme.link} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Get $CLAW</Text>
        </View>
        
        <Text style={[styles.buyDescription, { color: theme.textSecondary }]}>
          Purchase $CLAW tokens on Bags to instantly unlock Pro features and support the ecosystem.
        </Text>
        
        <Pressable 
          style={styles.buyButton}
          onPress={() => Linking.openURL('https://bags.fm')}
          testID="button-buy-claw"
        >
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buyButtonGradient}
          >
            <Feather name="external-link" size={18} color="#000" />
            <Text style={styles.buyButtonText}>Buy on Bags</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    ...Typography.h4,
    flex: 1,
  },
  walletLabel: {
    ...Typography.caption,
    marginBottom: Spacing.xs,
  },
  walletAddress: {
    ...Typography.body,
    fontFamily: 'monospace',
    marginBottom: Spacing.md,
  },
  walletDescription: {
    ...Typography.small,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  walletInputContainer: {
    gap: Spacing.md,
  },
  walletInput: {
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    ...Typography.body,
  },
  walletInputButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    ...Typography.body,
    fontWeight: '500',
  },
  connectButton: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  connectButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#FFF',
    ...Typography.body,
    fontWeight: '600',
  },
  phantomButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  phantomButtonGradient: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  phantomButtonText: {
    color: '#FFF',
    ...Typography.body,
    fontWeight: '600',
  },
  getPhantomButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  getPhantomText: {
    ...Typography.small,
  },
  disconnectButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  disconnectText: {
    ...Typography.small,
  },
  tokenStats: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
  },
  tokenStat: {
    flex: 1,
    alignItems: 'center',
  },
  tokenStatValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  tokenStatLabel: {
    ...Typography.caption,
    marginTop: 4,
  },
  tokenStatDivider: {
    width: 1,
    marginVertical: Spacing.xs,
  },
  proProgress: {
    gap: Spacing.xs,
  },
  proProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  proProgressLabel: {
    ...Typography.small,
  },
  proProgressValue: {
    ...Typography.small,
    fontWeight: '600',
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
  proHint: {
    ...Typography.caption,
    marginTop: Spacing.xs,
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
  proActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  proActiveText: {
    ...Typography.body,
    fontWeight: '500',
  },
  buyDescription: {
    ...Typography.small,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  buyButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  buyButtonGradient: {
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buyButtonText: {
    color: '#000',
    ...Typography.body,
    fontWeight: '700',
  },
});
