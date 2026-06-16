import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import {
  supabase,
  toUserProfile,
  findWarRoomByIdOrName,
} from "../lib/supabase";
import { isUserAlreadyRegistered } from "../lib/authErrors";
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

  if (error) {
    console.error("[Auth] fetchProfile error:", error.message);
    return null;
  }
  return data ? toUserProfile(data) : null;
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

  if (error) {
    console.error("[Auth] saveProfile error:", error.message, error);
    throw new Error(
      error.message.includes("row-level security") || error.code === "42501"
        ? "Não foi possível salvar o perfil (permissão negada). Verifique as policies da tabela users no Supabase."
        : `Não foi possível salvar o perfil: ${error.message}`
    );
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileRef = useRef<UserProfile | null>(null);

  const applyProfile = (next: UserProfile | null) => {
    profileRef.current = next;
    setProfile(next);
  };

  useEffect(() => {
    let mounted = true;

    const syncProfile = async (userId: string) => {
      const fetched = await fetchProfile(userId);
      if (!mounted) return;
      applyProfile(fetched ?? profileRef.current);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        syncProfile(currentUser.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        applyProfile(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session: Session | null) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (!currentUser) {
          applyProfile(null);
          setLoading(false);
          return;
        }

        // Evita deadlock/race com signUp + insert do perfil (recomendação Supabase)
        setTimeout(() => {
          if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
            syncProfile(currentUser.id).finally(() => setLoading(false));
          } else {
            setLoading(false);
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginWithEmail = async (
    email: string,
    password: string,
    isSignUp: boolean
  ): Promise<User> => {
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
  };

  const signUpUser = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    squad: string
  ): Promise<User> => {
    const trimmedEmail = email.trim().toLowerCase();
    const newUserProfile: UserProfile = {
      id: "",
      name: name.trim(),
      email: trimmedEmail,
      role,
      squad: squad.trim(),
      createdAt: new Date().toISOString(),
    };

    let authUser: User | null = null;

    const signUpResult = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          name: newUserProfile.name,
          role,
          squad: newUserProfile.squad,
        },
      },
    });

    if (isUserAlreadyRegistered(signUpResult.error)) {
      const loginResult = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (loginResult.error) {
        throw new Error(
          "Este e-mail já foi registrado em uma tentativa anterior que não completou o cadastro, e a senha não confere. " +
            "No Supabase → Authentication → Users, exclua este e-mail e cadastre-se novamente, " +
            "ou redefina a senha pelo painel do Supabase."
        );
      }

      authUser = loginResult.data.user;
      if (!loginResult.data.session) {
        throw new Error("Não foi possível iniciar sessão com este e-mail.");
      }
    } else if (signUpResult.error) {
      throw signUpResult.error;
    } else {
      if (!signUpResult.data.user) throw new Error("Falha ao criar conta.");

      if (!signUpResult.data.session) {
        throw new Error(
          "Conta criada, mas o login exige confirmação de e-mail. " +
            "Confirme o e-mail ou desative 'Confirm email' em Supabase → Authentication → Email."
        );
      }

      authUser = signUpResult.data.user;
    }

    if (!authUser) throw new Error("Falha ao autenticar após cadastro.");

    newUserProfile.id = authUser.id;

    const existing = await fetchProfile(authUser.id);
    if (!existing) {
      await saveProfile(newUserProfile);
      applyProfile(newUserProfile);
    } else {
      applyProfile(existing);
    }

    setUser(authUser);
    return authUser;
  };

  const loginAsGuest = async (
    name: string,
    squad: string,
    warRoomName: string
  ): Promise<string> => {
    const tempEmail = `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}@guest.forceqa.com`;
    const tempPassword = `guestPass_${Math.floor(Math.random() * 900000) + 100000}`;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: tempEmail,
        password: tempPassword,
      });
      if (error) throw error;
      if (!data.user || !data.session) {
        throw new Error("Falha ao criar sessão de convidado.");
      }

      const room = await findWarRoomByIdOrName(warRoomName);
      if (!room) {
        throw new Error(
          "A sala de guerra informada não existe ou o ID é inválido. Verifique se o ID/Nome está correto."
        );
      }

      if (room.guestAccessDisabled === true) {
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
      applyProfile(guestProfile);
      setUser(data.user);
      return room.id;
    } catch (error) {
      await supabase.auth.signOut();
      applyProfile(null);
      setUser(null);
      throw error;
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
    await supabase.auth.signOut();
    setUser(null);
    applyProfile(null);
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
    applyProfile(newProfile);
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
    applyProfile(updated);
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
