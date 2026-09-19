import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import {
  supabase,
  toUserProfile,
} from "../lib/supabase";
import { UserProfile, UserRole } from "../types";
import { SIGNUP_ROLES, resetRolePermissionMatrix, setRolePermissionMatrix } from "../lib/permissions";
import { fetchRolePermissionMatrix } from "../lib/services";
import { authFetch, readApiError } from "../lib/apiClient";
import { normalizeArea } from "../lib/squads";
import { resolveOrganizationId, DEFAULT_ORGANIZATION_ID } from "../lib/organizations";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  passwordRecovery: boolean;
  loginWithEmail: (email: string, password: string, isSignUp: boolean) => Promise<User>;
  loginAsGuest: (name: string, squad: string, warRoomName: string) => Promise<string>;
  adminCreateUser: (name: string, email: string, password: string, role: UserRole, squad: string, organizationId?: string) => Promise<string>;
  changePassword: (newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordRecovery: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  createProfile: (name: string, role: UserRole, squad: string) => Promise<void>;
  updateProfile: (profileData: Partial<UserProfile>) => Promise<void>;
  permissionEpoch: number;
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
    squad: normalizeArea(profile.squad),
    organization_id: profile.isGuest ? null : resolveOrganizationId(profile.organizationId),
    avatar_url: profile.avatarUrl || null,
    is_guest: profile.isGuest ?? false,
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
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [permissionEpoch, setPermissionEpoch] = useState(0);
  const profileRef = useRef<UserProfile | null>(null);

  const applyProfile = (next: UserProfile | null) => {
    profileRef.current = next;
    setProfile(next);
  };

  const hydratePermissions = async () => {
    try {
      setRolePermissionMatrix(await fetchRolePermissionMatrix());
    } catch {
      resetRolePermissionMatrix();
    }
    setPermissionEpoch((value) => value + 1);
  };

  useEffect(() => {
    let mounted = true;

    const syncProfile = async (userId: string) => {
      const fetched = await fetchProfile(userId);
      if (!mounted) return;
      applyProfile(fetched ?? profileRef.current);
      await hydratePermissions();
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
        resetRolePermissionMatrix();
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session: Session | null) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (!currentUser) {
          applyProfile(null);
          resetRolePermissionMatrix();
          setPermissionEpoch((value) => value + 1);
          setLoading(false);
          return;
        }

        // Evita deadlock/race com signUp + insert do perfil (recomendação Supabase)
        setTimeout(() => {
          if (event === "PASSWORD_RECOVERY") {
            setPasswordRecovery(true);
            setLoading(false);
            return;
          }
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

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("role-permissions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_permissions" },
        () => {
          void hydratePermissions();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loginWithEmail = async (
    email: string,
    password: string,
    isSignUp: boolean
  ): Promise<User> => {
    if (isSignUp) {
      throw new Error("Cadastro público desativado. Peça um convite a um admin.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    if (!data.user) throw new Error("Falha ao autenticar.");
    return data.user;
  };

  const loginAsGuest = async (
    name: string,
    squad: string,
    warRoomName: string
  ): Promise<string> => {
    const validateRes = await fetch("/api/guest/validate-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: warRoomName,
        join: true,
        name: name.trim(),
        squad: normalizeArea(squad),
      }),
    });
    if (!validateRes.ok) {
      const errData = await validateRes.json().catch(() => ({}));
      throw new Error(errData.error || "Não foi possível entrar como convidado.");
    }
    const room = (await validateRes.json()) as { roomId: string; email: string; password: string };

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: room.email,
        password: room.password,
      });
      if (error) throw error;
      if (!data.user || !data.session) {
        throw new Error("Falha ao criar sessão de convidado.");
      }

      const existing = await fetchProfile(data.user.id);
      if (existing) applyProfile(existing);
      setUser(data.user);
      return room.roomId;
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
    squad: string,
    organizationId?: string
  ) => {
    const response = await authFetch("/api/admin/create-user", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password,
        role,
        squad: normalizeArea(squad),
        organizationId,
      }),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "Erro ao criar usuário."));
    }

    const data = await response.json().catch(() => ({}));
    return String(data.userId || "");
  };

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) throw error;
  };

  const completePasswordRecovery = async (newPassword: string) => {
    if (newPassword.length < 6) {
      throw new Error("A nova senha deve ter no mínimo 6 caracteres.");
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setPasswordRecovery(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    applyProfile(null);
    resetRolePermissionMatrix();
    setPermissionEpoch((value) => value + 1);
  };

  const createProfile = async (name: string, role: UserRole, squad: string) => {
    if (!user) throw new Error("No authenticated user active.");
    const safeRole: UserRole = SIGNUP_ROLES.includes(role) ? role : "viewer";
    const newProfile: UserProfile = {
      id: user.id,
      name,
      email: user.email || "",
      role: safeRole,
      squad: normalizeArea(squad),
      organizationId: DEFAULT_ORGANIZATION_ID,
      isGuest: false,
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
      role: profile.role,
      isGuest: profile.isGuest,
      organizationId: profile.organizationId,
      isSuperadmin: profile.isSuperadmin,
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
        passwordRecovery,
        loginWithEmail,
        loginAsGuest,
        adminCreateUser,
        changePassword,
        requestPasswordReset,
        completePasswordRecovery,
        logout,
        createProfile,
        updateProfile,
        permissionEpoch,
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
