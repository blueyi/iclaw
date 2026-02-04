import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  isLoading: boolean;
  error: string | null;
}

interface ProfileContextType extends ProfileState {
  loadProfile: () => Promise<void>;
  claimDailyReward: () => Promise<{ tokensEarned: number; newBalance: number } | null>;
  connectWallet: (walletAddress: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const PROFILE_ID_KEY = '@iclaw_profile_id';

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileState>({
    profile: null,
    streak: null,
    canClaimDailyReward: false,
    proThreshold: 1000,
    isLoading: true,
    error: null,
  });

  const loadProfile = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const storedProfileId = await AsyncStorage.getItem(PROFILE_ID_KEY);
      
      let response;
      if (storedProfileId) {
        try {
          response = await fetch(new URL(`/api/profile/${storedProfileId}`, getApiUrl()).toString());
          if (!response.ok) {
            response = await apiRequest('POST', '/api/profile', {});
          }
        } catch {
          response = await apiRequest('POST', '/api/profile', {});
        }
      } else {
        response = await apiRequest('POST', '/api/profile', {});
      }
      
      const data = await response.json();
      
      if (data.profile) {
        await AsyncStorage.setItem(PROFILE_ID_KEY, data.profile.id);
        setState({
          profile: data.profile,
          streak: data.streak,
          canClaimDailyReward: data.canClaimDailyReward,
          proThreshold: data.proThreshold || 1000,
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
  }, []);

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
        }));
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [state.profile]);

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

  return (
    <ProfileContext.Provider
      value={{
        ...state,
        loadProfile,
        claimDailyReward,
        connectWallet,
        refreshProfile,
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
