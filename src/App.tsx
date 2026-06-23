import React, { useState, useEffect, useRef, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./components/LoginScreen";
import { Onboarding } from "./components/Onboarding";
import { Dashboard } from "./components/Dashboard";
import { WarRoomDetail } from "./components/WarRoomDetail";
import { AdminBoardViews } from "./components/AdminBoardViews";
import { Radio, ShieldAlert, LogOut, Terminal, Layers, Lock, User, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useModalA11y } from "./hooks/useModalA11y";

function AppContent() {
  const { user, profile, loading, updateProfile, changePassword, logout } = useAuth();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [adminPage, setAdminPage] = useState<"board-views" | null>(null);
  const [adminProjectId, setAdminProjectId] = useState<string | null>(null);

  const syncRouteFromLocation = useCallback(() => {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path === "/admin/board-views") {
      setAdminPage("board-views");
      const params = new URLSearchParams(window.location.search);
      setAdminProjectId(params.get("project"));
      return;
    }
    setAdminPage(null);
    setAdminProjectId(null);
  }, []);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileSquadInput, setProfileSquadInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const profileDialogRef = useRef<HTMLDivElement>(null);

  const closeProfileModal = useCallback(() => {
    setIsProfileModalOpen(false);
    setProfileError("");
    setProfileSuccess("");
    setNewPassword("");
    setConfirmPassword("");
  }, []);

  useModalA11y(isProfileModalOpen, closeProfileModal, profileDialogRef);

  useEffect(() => {
    if (profile) {
      setProfileNameInput(profile.name);
      setProfileSquadInput(profile.squad);
    }
  }, [profile]);

  const handleUpdateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess("");
    setProfileError("");
    setProfileSaving(true);
    try {
      if (profileNameInput.trim() !== profile?.name || profileSquadInput.trim() !== profile?.squad) {
        if (!profileNameInput.trim() || !profileSquadInput.trim()) {
          throw new Error("Nome e Squad são campos obrigatórios.");
        }
        await updateProfile({
          name: profileNameInput.trim(),
          squad: profileSquadInput.trim()
        });
        setProfileSuccess("Perfil atualizado com sucesso!");
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          throw new Error("A nova senha deve ter no mínimo 6 caracteres.");
        }
        if (newPassword !== confirmPassword) {
          throw new Error("As novas senhas digitadas não são idênticas.");
        }
        await changePassword(newPassword);
        setNewPassword("");
        setConfirmPassword("");
        setProfileSuccess("Senha alterada com sucesso!");
      }
    } catch (err: any) {
      console.error(err);
      setProfileError(err.message || "Erro desconhecido ao salvar as alterações.");
    } finally {
      setProfileSaving(false);
    }
  };

  // Deep linking: automatically open rooms from query parameters
  useEffect(() => {
    syncRouteFromLocation();
    const onPopState = () => syncRouteFromLocation();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncRouteFromLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl && user && profile) {
      setSelectedRoomId(roomFromUrl);
    }
  }, [user, profile]);

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    
    // Injects room into url dynamically so refreshing doesn't lose current room
    const newUrl = `${window.location.origin}/?room=${roomId}`;
    window.history.pushState({ path: newUrl }, "", newUrl);
  };

  const handleBackToDashboard = () => {
    setSelectedRoomId(null);
    setAdminPage(null);
    setAdminProjectId(null);
    const cleanUrl = window.location.origin;
    window.history.pushState({ path: cleanUrl }, "", cleanUrl);
  };

  const handleOpenAdminPage = (path: "/admin/board-views", projectId?: string) => {
    setSelectedRoomId(null);
    setAdminPage("board-views");
    setAdminProjectId(projectId ?? null);
    const url = projectId ? `${path}?project=${projectId}` : path;
    window.history.pushState({ path: url }, "", url);
  };

  // 1. Loading core state
  if (loading) {
    return (
      <div className="fq-loading">
        <div className="fq-spinner mb-4" />
        <p className="font-mono text-sm tracking-wide text-neutral-500">
          CONECTANDO AO SISTEMA DE OPERAÇÕES FORCE_QA...
        </p>
      </div>
    );
  }

  // 2. Guest landing flow
  if (!user) {
    return <LoginScreen />;
  }

  // 3. Authenticated but lacks squad profile onboarding flow
  if (!profile) {
    return <Onboarding />;
  }

  // 4. Main operation dashboards
  return (
    <div className="fq-shell flex flex-col">
      <header className="fq-header">
        <div 
          onClick={handleBackToDashboard}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-semibold text-neutral-300 transition group-hover:bg-white/[0.06]"
            style={{ backgroundColor: "var(--color-fq-elevated)", borderColor: "var(--color-fq-border)" }}
          >
            FQ
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight text-neutral-100 transition group-hover:text-white">
            ForceQA
          </span>
        </div>

        <div className="flex items-center gap-2 text-[13px]">
          <div 
            onClick={() => setIsProfileModalOpen(true)}
            className="flex cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 py-1.5 transition hover:bg-white/[0.05]"
            style={{ borderColor: "var(--color-fq-border)", backgroundColor: "rgba(255,255,255,0.03)" }}
            title="Clique para editar seu perfil ou alterar senha"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-[10px] font-medium text-neutral-300">
              {profile.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[13px] font-medium leading-none text-neutral-100">{profile.name}</span>
              <span className="text-[11px] leading-none mt-0.5 text-neutral-500">
                {profile.role === "admin" ? "ADMIN" : profile.role === "developer" ? "DEV" : profile.role.toUpperCase()} • {profile.squad}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="fq-btn-ghost !min-h-0 !px-2 !py-2"
            title="Sair (Logout)"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Primary viewport switch container */}
      <main className="flex min-h-0 flex-1 flex-col">
        {adminPage === "board-views" && profile?.role === "admin" ? (
          <AdminBoardViews onBack={handleBackToDashboard} initialProjectId={adminProjectId} />
        ) : selectedRoomId ? (
          <WarRoomDetail 
            roomId={selectedRoomId} 
            onBack={handleBackToDashboard} 
          />
        ) : (
          <Dashboard 
            onSelectRoom={handleSelectRoom}
            onOpenAdminPage={profile?.role === "admin" ? handleOpenAdminPage : undefined}
          />
        )}
      </main>

      {/* Interactive Profile & Password Update Modal Overlay */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fq-modal-overlay animate-fade-in">
            <motion.div 
              ref={profileDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fq-modal fq-modal--sm"
            >
              <div className="fq-modal-header !mb-4">
                <h3 id="profile-modal-title" className="fq-modal-title">
                  <User className="w-4 h-4 text-neutral-400" /> Configurações de Perfil
                </h3>
                <button 
                  onClick={closeProfileModal}
                  className="fq-btn-icon"
                  aria-label="Fechar"
                >
                  X
                </button>
              </div>

              {profileError && (
                <div className="fq-alert-error mb-4 font-mono">
                  ❌ {profileError}
                </div>
              )}

              {profileSuccess && (
                <div className="fq-alert-success mb-4 font-mono">
                  ✅ {profileSuccess}
                </div>
              )}

              <form onSubmit={handleUpdateProfileSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="fq-label fq-label--xs">
                    Seu Nome Completo
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      className="fq-input pl-9 font-mono text-xs"
                      placeholder="Seu nome"
                      value={profileNameInput}
                      onChange={(e) => setProfileNameInput(e.target.value)}
                    />
                    <User className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-500" />
                  </div>
                </div>

                <div>
                  <label className="fq-label fq-label--xs">
                    Sua Squad Operacional
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      className="fq-input pl-9 font-mono text-xs"
                      placeholder="Ex: Squad Core, Squad Pix"
                      value={profileSquadInput}
                      onChange={(e) => setProfileSquadInput(e.target.value)}
                    />
                    <Layers className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-500" />
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4 mt-2">
                  <h4 className="font-mono text-[10px] font-bold text-indigo-400 uppercase mb-3">
                    🔐 ALTERAR SENHA DE ACESSO (OPCIONAL)
                  </h4>
                  
                  <div className="space-y-3.5">
                    <div>
                      <label className="fq-label fq-label--xs !text-[9px]">
                        Nova Senha
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          className="fq-input pl-9 font-mono text-xs"
                          placeholder="Mínimo de 6 caracteres"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-500" />
                      </div>
                    </div>

                    <div>
                      <label className="fq-label fq-label--xs !text-[9px]">
                        Confirmar Nova Senha
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          className="fq-input pl-9 font-mono text-xs"
                          placeholder="Digite novamente"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-500" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={closeProfileModal}
                    className="fq-btn-ghost text-xs font-mono font-bold"
                  >
                    FECHAR
                  </button>
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="fq-btn-primary text-xs font-mono font-bold"
                  >
                    {profileSaving ? (
                      <>
                        <span className="fq-spinner !h-3 !w-3 !border-white !border-t-transparent" />
                        SALVANDO...
                      </>
                    ) : (
                      "SALVAR ALTERAÇÕES"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tactical logs footer status bar */}
      <footer className="fq-footer flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
        <div className="flex items-center gap-2">
          <span className="fq-status-dot" />
          <span>ESTADO: COMUNICAÇÃO SEGUIDA FIELMENTE NO SUPABASE</span>
        </div>
        <div>
          DATABASE_REF: <span className="text-neutral-500">forceqa-supabase</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
