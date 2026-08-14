
"use client";

import type React from 'react';
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Use the initialized auth instance
import { useToast } from '@/hooks/use-toast';

interface AuthContextProps {
  user: User | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<User | null>;
  signUp: (email: string, pass: string) => Promise<User | null>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);

  const signIn = useCallback(async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      return userCredential.user;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase auth errors expose `.code`/`.message`; unknown narrows too aggressively here.
      const err = error as any;
      console.error("Sign in error:", err);
      throw error; // Re-throw to be caught by the caller
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      return userCredential.user;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase createUser errors expose `.code`/`.message`; unknown narrows too aggressively here.
      const err = error as any;
      console.error("Sign up error:", err);
      throw error; // Re-throw to be caught by the caller
    } finally {
      setLoading(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase signOut errors expose `.code`/`.message`; unknown narrows too aggressively here.
      const err = error as any;
      console.error("Sign out error:", err);
      toast({ title: 'Error', description: 'Failed to log out.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const contextValue = useMemo(() => ({
    user,
    loading,
    signIn,
    signUp,
    signOutUser,
  }), [user, loading, signIn, signUp, signOutUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextProps => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
