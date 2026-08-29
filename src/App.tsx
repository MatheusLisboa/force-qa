import React, { useState, useEffect, useRef, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./components/LoginScreen";
import { Onboarding } from "./components/Onboarding";
import { Dashboard } from "./components/Dashboard";
import { WarRoomDetail } from "./components/WarRoomDetail";
import { AdminBoardViews } from "./components/AdminBoardViews";
import { AdminUsersPage } from "./components/AdminUsersPage";
import { AdminOrganizationsPage } from "./components/AdminOrganizationsPage";
import { LogOut, Lock, User, Bell, PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useModalA11y } from "./hooks/useModalA11y";
import { joinWarRoom, markAllNotificationsRead, markNotificationRead } from "./lib/services";
import { subscribeNotifications } from "./lib/supabase";
import { AppNotification } from "./types";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { adminBoardViewsPath, adminOrganizationsPath, adminUsersPath, dashboardPath, inboxPath, pushPath, roomPath } from "./lib/routes";
import { parsePulseKind, PulseKind } from "./lib/dashboardPulse";
import { formatRoleLabel } from "./lib/format";
import { SquadSelect } from "./components/SquadSelect";
import { canManageOrganizations, canManageUsers } from "./lib/permissions";
import { RoomRail } from "./components/RoomRail";
import { InboxPage } from "./components/InboxPage";
import { useOrgSpaces } from "./hooks/useOrgSpaces";

function AppContent() {
  const { user, profile, loading, passwordRecovery, updateProfile, changePassword, completePasswordRecovery, logout } = useAuth();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomPulse, setRoomPulse] = useState<PulseKind>("all");
  const [focusBugId, setFocusBugId] = useState<string | null>(null);
  const [focusBugAt, setFocusBugAt] = useState(0);
  const [adminPage, setAdminPage] = useState<"board-views" | "users" | "organizations" | null>(null);
  const [adminProjectId, setAdminProjectId] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySaving, setRecoverySaving] = useState(false);
  const { spaces, allBugs, loading: spacesLoading } = useOrgSpaces(
    profile?.organizationId,
    Boolean(user && profile)
  );
  const joinAttemptRef = useRef<string | null>(null);

  const syncRouteFromLocation = useCallback(() => {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path === "/inbox") {
      setAdminPage(null);
      setAdminProjectId(null);
      setInboxOpen(true);
      setSelectedRoomId(null);
      return;
    }
    setInboxOpen(false);
    if (path === "/admin/board-views") {
      setAdminPage("board-views");
      const params = new URLSearchParams(window.location.search);
      setAdminProjectId(params.get("project"));
      return;
    }
    if (path === "/admin/users") {
      setAdminPage("users");
      setAdminProjectId(null);
      return;
    }
    if (path === "/admin/organizations") {
      setAdminPage("organizations");
      setAdminProjectId(null);
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
          throw new Error("Nome e área são obrigatórios.");
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

  useEffect(() => {
    syncRouteFromLocation();
    const onPopState = () => syncRouteFromLocation();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncRouteFromLocation]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }
    return subscribeNotifications(user.id, setNotifications);
  }, [user?.id]);

  const openRoom = useCallback(async (roomId: string, pulse: PulseKind = "all", bugId?: string | null) => {
    setJoinError("");
    setInboxOpen(false);
    setFocusBugId(bugId || null);
    setFocusBugAt(Date.now());
    if (selectedRoomId === roomId) {
      setRoomPulse(pulse);
      pushPath(roomPath(roomId, pulse, bugId));
      return;
    }
    try {
      const joined = await joinWarRoom(roomId);
      setSelectedRoomId(joined);
      setRoomPulse(pulse);
      pushPath(roomPath(joined, pulse, bugId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Não foi possível abrir a sala.";
      setJoinError(message);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    const pulseFromUrl = parsePulseKind(params.get("pulse"));
    const cardFromUrl = params.get("card");
    if (
      roomFromUrl &&
      user &&
      profile &&
      selectedRoomId !== roomFromUrl &&
      joinAttemptRef.current !== roomFromUrl
    ) {
      joinAttemptRef.current = roomFromUrl;
      void openRoom(roomFromUrl, pulseFromUrl, cardFromUrl);
    }
  }, [user, profile, openRoom, selectedRoomId]);

  const handleSelectRoom = (roomId: string, pulse?: PulseKind) => {
    setRailOpen(false);
    void openRoom(roomId, pulse ?? "all");
  };

  const handleBackToDashboard = () => {
    setSelectedRoomId(null);
    setRoomPulse("all");
    setFocusBugId(null);
    setFocusBugAt(0);
    setAdminPage(null);
    setAdminProjectId(null);
    setInboxOpen(false);
    joinAttemptRef.current = null;
    setJoinError("");
    setRailOpen(false);
    pushPath(dashboardPath());
  };

  const handleOpenAdminPage = (path: "/admin/board-views" | "/admin/users" | "/admin/organizations", projectId?: string) => {
    setSelectedRoomId(null);
    setInboxOpen(false);
    setRailOpen(false);
    if (path === "/admin/users") {
      setAdminPage("users");
      setAdminProjectId(null);
      pushPath(adminUsersPath());
      return;
    }
    if (path === "/admin/organizations") {
      setAdminPage("organizations");
      setAdminProjectId(null);
      pushPath(adminOrganizationsPath());
      return;
    }
    setAdminPage("board-views");
    setAdminProjectId(projectId ?? null);
    pushPath(adminBoardViewsPath(projectId));
  };

  const handleOpenInbox = () => {
    setSelectedRoomId(null);
    setAdminPage(null);
    setAdminProjectId(null);
    setInboxOpen(true);
    setRailOpen(false);
    setJoinError("");
    pushPath(inboxPath());
  };

  // 1. Loading core state
  if (loading) {
    return (
      <div className="fq-loading">
        <div className="fq-spinner mb-4" />
        <p className="text-sm tracking-wide text-neutral-500">
          Carregando...
        </p>
      </div>
    );
  }

  // 2. Password recovery (magic link)
  if (passwordRecovery) {
    return (
      <div className="fq-shell flex min-h-screen items-center justify-center px-4">
        <form
          className="fq-auth-card max-w-md w-full space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setRecoveryError("");
            if (recoveryPassword !== recoveryConfirm) {
              setRecoveryError("As senhas não coincidem.");
              return;
            }
            setRecoverySaving(true);
            try {
              await completePasswordRecovery(recoveryPassword);
              setRecoveryPassword("");
              setRecoveryConfirm("");
            } catch (err: unknown) {
              setRecoveryError(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
            } finally {
              setRecoverySaving(false);
            }
          }}
        >
          <h1 className="font-display text-2xl font-bold text-white">Definir nova senha</h1>
          <p className="text-sm text-neutral-500">Digite a nova senha para concluir a recuperação de acesso.</p>
          {recoveryError && <div className="fq-alert-error text-xs">{recoveryError}</div>}
          <input
            type="password"
            required
            minLength={6}
            className="fq-input"
            placeholder="Nova senha (mín. 6 caracteres)"
            value={recoveryPassword}
            onChange={(e) => setRecoveryPassword(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={6}
            className="fq-input"
            placeholder="Confirmar nova senha"
            value={recoveryConfirm}
            onChange={(e) => setRecoveryConfirm(e.target.value)}
          />
          <button type="submit" disabled={recoverySaving} className="fq-btn-primary w-full">
            {recoverySaving ? "Salvando..." : "Salvar senha"}
          </button>
        </form>
      </div>
    );
  }

  // 3. Guest landing flow
  if (!user) {
    return <LoginScreen />;
  }

  // 4. Authenticated but lacks squad profile onboarding flow
  if (!profile || !profile.squad.trim()) {
    return <Onboarding />;
  }

  // 4. Main operation dashboards
  return (
    <div className="fq-shell flex h-dvh flex-col overflow-hidden">
      <header className="fq-header">
        <div className="flex items-center gap-2">
          {!adminPage && (
            <button
              type="button"
              className="fq-btn-ghost !min-h-0 !px-2 !py-2 md:hidden"
              title="Salas"
              aria-expanded={railOpen}
              onClick={() => setRailOpen((open) => !open)}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <div onClick={handleBackToDashboard} className="fq-header-brand">
            <div className="fq-brand-mark">FQ</div>
            <span className="fq-header-brand-name">ForceQA</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[13px]">
          {joinError && (
            <span className="hidden md:inline max-w-[220px] truncate text-[11px] text-red-400 font-mono" title={joinError}>
              {joinError}
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((open) => !open)}
              className="fq-btn-ghost !min-h-0 !px-2 !py-2 relative"
              title="Notificações"
            >
              <Bell className="w-4 h-4" />
              {notifications.some((n) => !n.readAt) && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
            </button>
            {notifOpen && (
              <div className="fq-menu w-80 max-h-80 overflow-y-auto p-2 space-y-1">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[13px] font-medium text-neutral-500">Notificações</span>
                  {notifications.some((n) => !n.readAt) && (
                    <button
                      type="button"
                      className="text-[10px] text-neutral-400 hover:text-neutral-200"
                      onClick={() => profile && markAllNotificationsRead(profile.id)}
                    >
                      Marcar todas lidas
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-neutral-500 px-2 py-4">Nenhuma notificação.</p>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`w-full text-left rounded-md px-2 py-2 text-xs hover:bg-white/[0.04] ${item.readAt ? "opacity-60" : ""}`}
                      onClick={async () => {
                        await markNotificationRead(item.id);
                        setNotifOpen(false);
                        if (item.warRoomId) void openRoom(item.warRoomId, "all", item.bugId);
                      }}
                    >
                      <span className="block font-medium text-neutral-100">{item.title}</span>
                      {item.body && <span className="block text-neutral-500 mt-0.5">{item.body}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="fq-header-user"
            title="Clique para editar seu perfil ou alterar senha"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-[10px] font-semibold text-neutral-200">
              {profile.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[13px] font-medium leading-none text-neutral-100">{profile.name}</span>
              <span className="text-[11px] leading-none mt-0.5 text-neutral-500">
                {formatRoleLabel(profile.role)} · {profile.squad}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="fq-btn-ghost !min-h-0 !px-2 !py-2"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Primary viewport switch container */}
      <main className="flex min-h-0 flex-1">
          {!adminPage && (
            <RoomRail
              spaces={spaces}
              bugs={allBugs}
              currentRoomId={selectedRoomId}
              inboxOpen={inboxOpen}
              loading={spacesLoading}
              mobileOpen={railOpen}
              onCloseMobile={() => setRailOpen(false)}
              onSelectRoom={handleSelectRoom}
              onOpenDashboard={handleBackToDashboard}
              onOpenInbox={handleOpenInbox}
            />
          )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        {adminPage === "organizations" && canManageOrganizations(profile?.isSuperadmin) ? (
          <AdminOrganizationsPage onBack={handleBackToDashboard} />
        ) : adminPage === "users" && canManageUsers(profile?.role, profile?.isSuperadmin) ? (
          <AdminUsersPage onBack={handleBackToDashboard} />
        ) : adminPage === "board-views" && canManageUsers(profile?.role, profile?.isSuperadmin) ? (
          <AdminBoardViews onBack={handleBackToDashboard} initialProjectId={adminProjectId} />
        ) : inboxOpen ? (
          <InboxPage
            onOpenCard={(roomId, bugId) => {
              void openRoom(roomId, "all", bugId);
            }}
          />
        ) : selectedRoomId ? (
          <WarRoomDetail 
            roomId={selectedRoomId} 
            initialPulse={roomPulse}
            initialBugId={focusBugId}
            initialBugAt={focusBugAt}
            onBack={handleBackToDashboard} 
          />
        ) : (
          <Dashboard 
            spaces={spaces}
            allBugs={allBugs}
            loading={spacesLoading}
            onSelectRoom={handleSelectRoom}
            onOpenAdminPage={
              canManageUsers(profile?.role, profile?.isSuperadmin) || canManageOrganizations(profile?.isSuperadmin)
                ? handleOpenAdminPage
                : undefined
            }
            onOpenInbox={handleOpenInbox}
          />
        )}
        </div>
      </main>

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
                    Sua área
                  </label>
                  <SquadSelect
                    required
                    value={profileSquadInput}
                    onChange={setProfileSquadInput}
                  />
                </div>

                <div className="border-t border-white/[0.06] pt-4 mt-2">
                  <h4 className="text-[13px] font-medium text-neutral-300 mb-3">
                    Alterar senha (opcional)
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
                    className="fq-btn-ghost text-sm"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="fq-btn-primary text-sm"
                  >
                    {profileSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
