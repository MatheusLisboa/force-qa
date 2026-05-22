import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./components/LoginScreen";
import { Onboarding } from "./components/Onboarding";
import { Dashboard } from "./components/Dashboard";
import { WarRoomDetail } from "./components/WarRoomDetail";
import { Radio, ShieldAlert, LogOut, Terminal, Layers, Lock, User, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function AppContent() {
  const { user, profile, loading, updateProfile, changePassword, logout } = useAuth();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileSquadInput, setProfileSquadInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

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
    const cleanUrl = window.location.origin;
    window.history.pushState({ path: cleanUrl }, "", cleanUrl);
  };

  // 1. Loading core state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080b13] flex flex-col justify-center items-center">
        <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-450 font-mono text-sm tracking-wide">
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
    <div className="min-h-screen bg-[#080b13] text-slate-100 flex flex-col">
      {/* Dynamic top military toolbar panel header */}
      <header className="bg-[#0b0f19]/90 border-b border-slate-900/60 sticky top-0 z-30 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div 
          onClick={handleBackToDashboard}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="p-1 px-2 bg-red-650/15 border border-red-500/25 rounded font-mono text-xs font-black tracking-widest text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)] group-hover:scale-102 transition">
            WAR ROOM QA
          </div>
          <span className="font-display font-black text-white text-base tracking-tight group-hover:text-red-400 transition">
            ForceQA
          </span>
        </div>

        {/* User context action toolbar */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div 
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-2.5 bg-[#0d1220]/85 hover:bg-slate-950 border border-slate-900 px-3 py-1.5 rounded-lg cursor-pointer transition select-none group"
            title="Clique para editar seu perfil ou alterar senha"
          >
            <div className="w-6.5 h-6.5 rounded bg-red-950/45 text-red-400 flex items-center justify-center font-bold border border-red-900/30 text-[10px] group-hover:bg-red-500/20 group-hover:text-white transition">
              {profile.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-slate-100 font-bold group-hover:text-red-400 transition leading-none text-xs">{profile.name}</span>
              <span className="text-[9px] text-slate-450 uppercase leading-none mt-1">
                {profile.role === "admin" ? "ADMIN" : profile.role === "developer" ? "DEV" : profile.role.toUpperCase()} • {profile.squad}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 cursor-pointer flex items-center gap-1.5 transition text-xs font-mono font-bold"
            title="Sair (Logout)"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Primary viewport switch container */}
      <main className="flex-1">
        {selectedRoomId ? (
          <WarRoomDetail 
            roomId={selectedRoomId} 
            onBack={handleBackToDashboard} 
          />
        ) : (
          <Dashboard 
            onSelectRoom={handleSelectRoom} 
          />
        )}
      </main>

      {/* Interactive Profile & Password Update Modal Overlay */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080b13]/85 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0d1220] border border-[#1e293b] rounded-2xl shadow-2xl p-6 relative"
            >
              <div className="flex justify-between items-center border-b border-white/[0.04] pb-4 mb-4">
                <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-red-500" /> Configurações de Perfil
                </h3>
                <button 
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    setProfileError("");
                    setProfileSuccess("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded text-[10px] font-mono font-bold transition cursor-pointer"
                >
                  X
                </button>
              </div>

              {profileError && (
                <div className="p-3 bg-red-900/20 border border-red-550/20 text-red-400 text-xs rounded-lg mb-4 font-mono">
                  ❌ {profileError}
                </div>
              )}

              {profileSuccess && (
                <div className="p-3 bg-green-950/20 border border-green-500/20 text-green-400 text-xs rounded-lg mb-4 font-mono">
                  ✅ {profileSuccess}
                </div>
              )}

              <form onSubmit={handleUpdateProfileSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5Packed">
                    Seu Nome Completo
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      className="w-full bg-[#05070a] border border-slate-800 focus:border-red-500/50 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition"
                      placeholder="Seu nome"
                      value={profileNameInput}
                      onChange={(e) => setProfileNameInput(e.target.value)}
                    />
                    <User className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-550" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">
                    Sua Squad Operacional
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      className="w-full bg-[#05070a] border border-slate-800 focus:border-red-500/50 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition"
                      placeholder="Ex: Squad Core, Squad Pix"
                      value={profileSquadInput}
                      onChange={(e) => setProfileSquadInput(e.target.value)}
                    />
                    <Layers className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-550" />
                  </div>
                </div>

                <div className="border-t border-white/[0.04] pt-4 mt-2">
                  <h4 className="font-mono text-[10px] font-bold text-indigo-400 uppercase mb-3">
                    🔐 ALTERAR SENHA DE ACESSO (OPCIONAL)
                  </h4>
                  
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-[9px] font-mono text-slate-450 uppercase mb-1.5">
                        Nova Senha
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          className="w-full bg-[#05070a] border border-slate-800 focus:border-red-500/50 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-650 focus:outline-none transition"
                          placeholder="Mínimo de 6 caracteres"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-550" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-450 uppercase mb-1.5">
                        Confirmar Nova Senha
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          className="w-full bg-[#05070a] border border-slate-800 focus:border-red-500/50 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-655 focus:outline-none transition"
                          placeholder="Digite novamente"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-550" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileModalOpen(false);
                      setProfileError("");
                      setProfileSuccess("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-350 text-xs font-mono font-bold rounded-lg cursor-pointer transition"
                  >
                    FECHAR
                  </button>
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="px-4 py-1.5 bg-red-650 hover:bg-red-500 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)] text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition flex items-center gap-1.5"
                  >
                    {profileSaving ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
      <footer className="bg-[#0b0f19] border-t border-slate-950 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-mono text-slate-550">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>ESTADO: COMUNICAÇÃO SEGUIDA FIELMENTE NO FIRESTORE</span>
        </div>
        <div>
          DATABASE_REF: <span className="text-slate-450">force-task-firestore-node</span>
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
