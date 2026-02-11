import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

interface UserProfile {
  id: string;
  walletAddress: string | null;
  referralCode: string;
  referredBy: string | null;
  totalTokensEarned: number;
  currentTokenBalance: number;
  isPro: boolean;
  proExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserStreak {
  id: string;
  profileId: string;
  currentStreak: number;
  longestStreak: number;
  lastClaimDate: string | null;
  totalDaysClaimed: number;
  updatedAt: string;
}

interface ProfileState {
  profile: UserProfile | null;
  streak: UserStreak | null;
  canClaimDailyReward: boolean;
  proThreshold: number;
  proUsdValue: number;
  messagesUsed: number;
  messageLimit: number;
  isLoading: boolean;
  error: string | null;
}

interface ProfileContextType extends ProfileState {
  loadProfile: () => Promise<void>;
  claimDailyReward: () => Promise<{ tokensEarned: number; newBalance: number } | null>;
  connectWallet: (walletAddress: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  incrementLocalUsage: () => void;
  remainingMessages: number;
  canSendMessage: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const PROFILE_ID_KEY = '@iclaw_profile_id';

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [state, setState] = useState<ProfileState>({
    profile: null,
    streak: null,
    canClaimDailyReward: false,
    proThreshold: 1000,
    proUsdValue: 100,
    messagesUsed: 0,
    messageLimit: 5,
    isLoading: true,
    error: null,
  });

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [token]);

  const loadProfile = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const storedProfileId = await AsyncStorage.getItem(PROFILE_ID_KEY);
      
      let response;
      if (storedProfileId) {
        try {
          response = await fetch(new URL(`/api/profile/${storedProfileId}`, getApiUrl()).toString(), {
            headers: authHeaders(),
          });
          if (!response.ok) {
            response = await fetch(new URL('/api/profile', getApiUrl()).toString(), {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({}),
            });
          }
        } catch {
          response = await fetch(new URL('/api/profile', getApiUrl()).toString(), {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({}),
          });
        }
      } else {
        response = await fetch(new URL('/api/profile', getApiUrl()).toString(), {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({}),
        });
      }
      
      const data = await response.json();
      
      if (data.profile) {
        await AsyncStorage.setItem(PROFILE_ID_KEY, data.profile.id);
        setState({
          profile: data.profile,
          streak: data.streak,
          canClaimDailyReward: data.canClaimDailyReward,
          proThreshold: data.proThreshold || 1000,
          proUsdValue: data.proUsdValue || 100,
          messagesUsed: data.messagesUsed || 0,
          messageLimit: data.messageLimit || 5,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load profile',
      }));
    }
  }, [authHeaders]);

  const refreshProfile = useCallback(async () => {
    if (!state.profile) return;
    
    try {
      const response = await fetch(new URL(`/api/profile/${state.profile.id}`, getApiUrl()).toString());
      if (response.ok) {
        const data = await response.json();
        setState(prev => ({
          ...prev,
          profile: data.profile,
          streak: data.streak,
          canClaimDailyReward: data.canClaimDailyReward,
          messagesUsed: data.messagesUsed || prev.messagesUsed,
          messageLimit: data.messageLimit || prev.messageLimit,
        }));
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [state.profile]);

  const refreshUsage = useCallback(async () => {
    if (!state.profile) return;
    
    try {
      const response = await fetch(new URL(`/api/usage/${state.profile.id}`, getApiUrl()).toString());
      if (response.ok) {
        const data = await response.json();
        setState(prev => ({
          ...prev,
          messagesUsed: data.messagesUsed,
          messageLimit: data.messageLimit,
        }));
      }
    } catch (error) {
      console.error('Error refreshing usage:', error);
    }
  }, [state.profile]);

  const incrementLocalUsage = useCallback(() => {
    setState(prev => ({
      ...prev,
      messagesUsed: prev.messagesUsed + 1,
    }));
  }, []);

  const claimDailyReward = useCallback(async () => {
    if (!state.profile) return null;
    
    try {
      const response = await apiRequest('POST', '/api/rewards/claim', {
        profileId: state.profile.id,
      });
      
      const data = await response.json();
      
      if (data.success) {
        setState(prev => ({
          ...prev,
          profile: prev.profile ? {
            ...prev.profile,
            currentTokenBalance: data.newBalance,
          } : null,
          streak: data.streak,
          canClaimDailyReward: false,
        }));
        
        return {
          tokensEarned: data.tokensEarned,
          newBalance: data.newBalance,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error claiming reward:', error);
      return null;
    }
  }, [state.profile]);

  const connectWallet = useCallback(async (walletAddress: string) => {
    if (!state.profile) return;
    
    try {
      const response = await apiRequest('PUT', `/api/profile/${state.profile.id}/wallet`, {
        walletAddress,
      });
      
      const updatedProfile = await response.json();
      
      setState(prev => ({
        ...prev,
        profile: {
          ...prev.profile!,
          walletAddress: updatedProfile.walletAddress,
        },
      }));
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  }, [state.profile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const isPro = state.profile?.isPro || false;
  const remainingMessages = isPro ? -1 : Math.max(0, state.messageLimit - state.messagesUsed);
  const canSendMessage = isPro || remainingMessages > 0;

  return (
    <ProfileContext.Provider
      value={{
        ...state,
        loadProfile,
        claimDailyReward,
        connectWallet,
        refreshProfile,
        refreshUsage,
        incrementLocalUsage,
        remainingMessages,
        canSendMessage,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
