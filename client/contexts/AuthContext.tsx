import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = '@iclaw_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    try {
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
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Connection failed. Please try again.' };
    }
  }, []);

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
      return { success: true };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'Connection failed. Please try again.' };
    }
  }, []);

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

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
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
