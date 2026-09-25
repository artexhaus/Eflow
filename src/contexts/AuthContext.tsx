import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type SignUpResult = 'signed_in' | 'confirm_email';

interface AuthContextType {
  user: SupabaseUser | null;
  loading: boolean;
  // True after the user opened a password-reset link: show "set a new password".
  recoveringPassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  finishPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // The reset-password email link signs the user in with a recovery
      // session; ask for a new password before anything else.
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  };

  // The users row (mailbox connection) is created later by imap-connect, when
  // the user connects their mailbox.
  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    // With email confirmation on, Supabase returns no session until the link
    // in the confirmation email is clicked.
    return data.session ? 'signed_in' : 'confirm_email';
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await supabase.auth.signOut();
      }

      setUser(null);
      setLoading(false);
    } catch {
      setUser(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        recoveringPassword,
        signIn,
        signUp,
        sendPasswordReset,
        updatePassword,
        finishPasswordRecovery: () => setRecoveringPassword(false),
        signOut,
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
