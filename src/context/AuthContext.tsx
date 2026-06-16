import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import {
  supabase,
  handleDbError,
  OperationType,
  toUserProfile,
  findWarRoomByIdOrName,
} from "../lib/supabase";
import { UserProfile, UserRole } from "../types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string, isSignUp: boolean) => Promise<User>;
  signUpUser: (name: string, email: string, password: string, role: UserRole, squad: string) => Promise<User>;
  loginAsGuest: (name: string, squad: string, warRoomName: string) => Promise<string>;
  adminCreateUser: (name: string, email: string, password: string, role: UserRole, squad: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  createProfile: (name: string, role: UserRole, squad: string) => Promise<void>;
  updateProfile: (profileData: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return toUserProfile(data);
}

async function saveProfile(profile: UserProfile): Promise<void> {
  const { error } = await supabase.from("users").upsert({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    squad: profile.squad,
    avatar_url: profile.avatarUrl || null,
    created_at: profile.createdAt || new Date().toISOString(),
  });
  if (error) handleDbError(error, OperationType.WRITE, `users/${profile.id}`);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const p = await fetchProfile(currentUser.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loginWithEmail = async (
    email: string,
    password: string,
    isSignUp: boolean
  ): Promise<User> => {
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.user) throw new Error("Falha ao criar conta.");
        return data.user;
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Falha ao autenticar.");
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const signUpUser = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    squad: string
  ): Promise<User> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Falha ao criar conta.");

      if (!data.session) {
        throw new Error(
          "Conta criada, mas o login exige confirmação de e-mail. " +
            "Confirme o e-mail ou desative 'Confirm email' em Supabase → Authentication → Email."
        );
      }

      const newUserProfile: UserProfile = {
        id: data.user.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        squad: squad.trim(),
        createdAt: new Date().toISOString(),
      };

      await saveProfile(newUserProfile);
      setProfile(newUserProfile);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const loginAsGuest = async (
    name: string,
    squad: string,
    warRoomName: string
  ): Promise<string> => {
    setLoading(true);
    const tempEmail = `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}@guest.forceqa.com`;
    const tempPassword = `guestPass_${Math.floor(Math.random() * 900000) + 100000}`;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: tempEmail,
        password: tempPassword,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Falha ao criar sessão de convidado.");

      const room = await findWarRoomByIdOrName(warRoomName);
      if (!room) {
        await supabase.auth.signOut();
        throw new Error(
          "A sala de guerra informada não existe ou o ID é inválido. Verifique se o ID/Nome está correto."
        );
      }

      if (room.guestAccessDisabled === true) {
        await supabase.auth.signOut();
        throw new Error(
          "O acesso de convidados (Guest) para esta Sala de Guerra foi desativado pelo administrador."
        );
      }

      const guestProfile: UserProfile = {
        id: data.user.id,
        name: name.trim(),
        email: tempEmail,
        role: "viewer",
        squad: squad.trim(),
        createdAt: new Date().toISOString(),
      };

      await saveProfile(guestProfile);
      setProfile(guestProfile);
      return room.id;
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const adminCreateUser = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    squad: string
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");

    const response = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name, email, password, role, squad }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Erro ao criar usuário.");
    }
  };

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const logout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (name: string, role: UserRole, squad: string) => {
    if (!user) throw new Error("No authenticated user active.");
    const newProfile: UserProfile = {
      id: user.id,
      name,
      email: user.email || "",
      role,
      squad,
      createdAt: new Date().toISOString(),
    };
    if (user.user_metadata?.avatar_url) {
      newProfile.avatarUrl = user.user_metadata.avatar_url;
    }
    await saveProfile(newProfile);
    setProfile(newProfile);
  };

  const updateProfile = async (profileData: Partial<UserProfile>) => {
    if (!user || !profile) throw new Error("No profile active to update.");
    const updated: UserProfile = {
      ...profile,
      ...profileData,
      id: user.id,
      email: profile.email,
    };
    await saveProfile(updated);
    setProfile(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        loginWithEmail,
        signUpUser,
        loginAsGuest,
        adminCreateUser,
        changePassword,
        logout,
        createProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
