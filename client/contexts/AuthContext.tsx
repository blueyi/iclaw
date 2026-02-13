import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { apiRequest, getApiUrl } from '@/lib/query-client';

interface AuthUser {
  id: string;
  username: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  biometricLogin: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = '@iclaw_auth_token';
const BIOMETRIC_ENABLED_KEY = '@iclaw_biometric_enabled';
const BIOMETRIC_TOKEN_KEY = '@iclaw_bio_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    const checkBiometricAvailability = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHardware && isEnrolled);
      } catch (error) {
        console.error('Error checking biometric availability:', error);
        setBiometricAvailable(false);
      }
    };

    checkBiometricAvailability();
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const biometricEnabledFlag = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      setBiometricEnabled(biometricEnabledFlag === 'true');

      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(new URL('/api/auth/me', getApiUrl()).toString(), {
        headers: { 'Authorization': `Bearer ${storedToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setToken(storedToken);
      } else {
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch (error) {
      console.error('Error restoring session:', error);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await fetch(new URL('/api/auth/login', getApiUrl()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setUser(data.user);
      setToken(data.token);

      if (biometricEnabled) {
        try {
          await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, data.token);
        } catch (error) {
          console.error('Error saving biometric token:', error);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Connection failed. Please try again.' };
    }
  }, [biometricEnabled]);

  const register = useCallback(async (username: string, password: string) => {
    try {
      const response = await fetch(new URL('/api/auth/register', getApiUrl()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Registration failed' };
      }

      await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setUser(data.user);
      setToken(data.token);

      if (biometricEnabled) {
        try {
          await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, data.token);
        } catch (error) {
          console.error('Error saving biometric token:', error);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'Connection failed. Please try again.' };
    }
  }, [biometricEnabled]);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(new URL('/api/auth/logout', getApiUrl()).toString(), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem('@iclaw_profile_id');
      setUser(null);
      setToken(null);
    }
  }, [token]);

  const enableBiometric = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
      if (token) {
        await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, token);
      }
      setBiometricEnabled(true);
    } catch (error) {
      console.error('Error enabling biometric:', error);
      throw error;
    }
  }, [token]);

  const disableBiometric = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
      setBiometricEnabled(false);
    } catch (error) {
      console.error('Error disabling biometric:', error);
      throw error;
    }
  }, []);

  const biometricLogin = useCallback(async () => {
    try {
      const authenticated = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to I-CLAW',
        cancelLabel: 'Use Password',
        disableDeviceFallback: false,
      });

      if (!authenticated.success) {
        return { success: false, error: 'Biometric authentication failed' };
      }

      const storedToken = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
      if (!storedToken) {
        return { success: false, error: 'No biometric token stored' };
      }

      const response = await fetch(new URL('/api/auth/me', getApiUrl()).toString(), {
        headers: { 'Authorization': `Bearer ${storedToken}` },
      });

      if (!response.ok) {
        await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
        await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
        setBiometricEnabled(false);
        return { success: false, error: 'Token validation failed' };
      }

      const data = await response.json();
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, storedToken);
      setUser(data.user);
      setToken(storedToken);
      return { success: true };
    } catch (error) {
      console.error('Biometric login error:', error);
      return { success: false, error: 'Biometric login failed' };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        biometricAvailable,
        biometricEnabled,
        login,
        register,
        logout,
        enableBiometric,
        disableBiometric,
        biometricLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
