import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LogIn, Sparkles, AlertTriangle, ShieldCheck, Zap, Mail, UserPlus, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const LoginScreen: React.FC = () => {
  const { loginWithEmail, loginAsGuest } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<"email" | "guest">("email");

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Guest form state
  const [guestName, setGuestName] = useState("");
  const [guestSquad, setGuestSquad] = useState("dev"); // default 'dev'
  const [customSquad, setCustomSquad] = useState("");
  const [warRoomName, setWarRoomName] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState("");

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setEmailError("Por favor, preencha todos os campos.");
      return;
    }
    if (password.length < 6) {
      setEmailError("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    setEmailLoading(true);
    setEmailError("");
    try {
      await loginWithEmail(email.trim(), password, isSignUp);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found") {
        setEmailError("Usuário não encontrado. Se você é novo por aqui, ative o cadastro abaixo.");
      } else if (err.code === "auth/wrong-password") {
        setEmailError("Senha incorreta. Tente novamente.");
      } else if (err.code === "auth/email-already-in-use") {
        setEmailError("Este e-mail já está sendo utilizado.");
      } else if (err.code === "auth/invalid-email") {
        setEmailError("Endereço de e-mail inválido.");
      } else {
        setEmailError(err.message || "Erro ao autenticar. Tente novamente.");
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setGuestError("Por favor, preencha o seu nome.");
      return;
    }

    const selectedSquad = guestSquad === "other" ? customSquad.trim() : guestSquad;
    if (!selectedSquad) {
      setGuestError("Por favor, informe a qual squad você pertence (ex: dev, dba).");
      return;
    }

    if (!warRoomName.trim()) {
      setGuestError("Por favor, digite o nome exato da WarRoom que deseja entrar.");
      return;
    }

    setGuestLoading(true);
    setGuestError("");
    try {
      const roomId = await loginAsGuest(guestName, selectedSquad, warRoomName);
      // Perfect redirection to specific warroom
      window.location.href = `/?room=${roomId}`;
    } catch (err: any) {
      console.error(err);
      setGuestError(err.message || "Erro ao conectar como convidado.");
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#080b13] relative overflow-hidden room-banner-glow">
      {/* Decorative futuristic laser lines */}
      <div className="absolute top-0 left-1/4 w-px h-64 bg-gradient-to-down from-red-500/20 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-px h-96 bg-gradient-to-down from-blue-500/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.06),transparent_60%)] pointer-events-none" />

      {/* Header element */}
      <div className="p-6 flex items-center justify-between border-b border-white/[0.03] z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-1 px-2.5 bg-red-500/15 text-red-500 border border-red-500/20 rounded-md font-mono text-sm font-bold tracking-widest shadow-[0_0_10px_rgba(239,68,68,0.15)]">
            TASKFORCE
          </div>
          <span className="font-display font-black text-lg tracking-tight text-white">
            ForceQA
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#475569]">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          SYSTEM_ONLINE // DEPLOY_HOT
        </div>
      </div>

      {/* Main hero and login container */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-lg bg-[#0d1220]/90 border border-[#1e293b] backdrop-blur-xl rounded-2xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
          <div className="text-center">
            <div className="inline-flex p-3 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 mb-4 relative">
              <ShieldCheck className="w-8 h-8" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </div>
            
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white mb-1">
              ForceQA <span className="text-red-500 font-light">StrikeBoard</span>
            </h1>
            <p className="text-slate-400 text-xs max-w-sm mx-auto mb-6 leading-relaxed">
              Plataforma de guerra ágil e em tempo real para controle tático de bugs críticos.
            </p>
          </div>

          {/* Premium Selector Tabs */}
          <div className="grid grid-cols-2 bg-[#0a0d16] p-1 rounded-xl border border-slate-800/80 mb-6 font-mono text-[11px] font-bold text-center">
            <button
              onClick={() => setActiveTab("email")}
              className={`py-2 px-1 rounded-lg transition-all duration-150 cursor-pointer ${
                activeTab === "email"
                  ? "bg-red-550/15 border border-red-500/20 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/50"
              }`}
            >
              E-MAIL
            </button>
            <button
              onClick={() => setActiveTab("guest")}
              className={`py-2 px-1 rounded-lg transition-all duration-150 cursor-pointer ${
                activeTab === "guest"
                  ? "bg-red-550/15 border border-red-500/20 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/50"
              }`}
            >
              CONVIDADO
            </button>
          </div>

          {/* Tabs Viewports */}
          <AnimatePresence mode="wait">
            {activeTab === "email" && (
              <motion.div
                key="email"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
              >
                {emailError && (
                  <div className="p-3 bg-red-900/20 border border-red-550/30 text-red-400 text-xs rounded-lg mb-4 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{emailError}</span>
                  </div>
                )}

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">E-MAIL CORPORATIVO / PESSOAL</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        className="w-full bg-[#0a0d16] border border-slate-800 focus:border-red-500/50 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 select-none focus:outline-none focus:ring-0 transition"
                        placeholder="Ex: dba@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-550" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">SENHA DE ACESSO</label>
                    <input
                      type="password"
                      required
                      className="w-full bg-[#0a0d16] border border-slate-800 focus:border-red-500/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full flex items-center justify-center gap-2.5 bg-red-650 hover:bg-red-600 disabled:bg-slate-800 disabled:text-slate-550 text-white font-semibold py-2.5 px-4 rounded-xl border border-red-500/20 shadow-[0_4px_15px_rgba(239,68,68,0.15)] transition cursor-pointer"
                  >
                    {emailLoading ? (
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : isSignUp ? (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Criar Conta e Entrar
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        Autenticar por E-mail
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setEmailError("");
                      }}
                      className="text-xs text-red-400 hover:text-red-300 font-mono underline hover:no-underline"
                    >
                      {isSignUp ? "Já possui conta? Fazer Login por e-mail" : "Não tem conta? Cadastrar-se agora"}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {activeTab === "guest" && (
              <motion.div
                key="guest"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
              >
                {guestError && (
                  <div className="p-3 bg-red-900/20 border border-red-550/30 text-red-400 text-xs rounded-lg mb-4 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{guestError}</span>
                  </div>
                )}

                <form onSubmit={handleGuestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">SEU NOME COMPLETO</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Rodrigo Silva, Ana Souza"
                      className="w-full bg-[#0a0d16] border border-slate-800 focus:border-red-500/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2">SUA SQUAD OPERACIONAL</label>
                    <div className="grid grid-cols-3 gap-2.5 mb-2 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => setGuestSquad("dev")}
                        className={`py-2 px-3 border rounded-lg font-bold transition cursor-pointer text-center ${
                          guestSquad === "dev"
                            ? "bg-red-500/10 border-red-500/40 text-red-400 font-black"
                            : "bg-[#0a0d16] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        DEV
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuestSquad("dba")}
                        className={`py-2 px-3 border rounded-lg font-bold transition cursor-pointer text-center ${
                          guestSquad === "dba"
                            ? "bg-red-500/10 border-red-500/40 text-red-400 font-black"
                            : "bg-[#0a0d16] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        DBA
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuestSquad("other")}
                        className={`py-2 px-3 border rounded-lg font-bold transition cursor-pointer text-center ${
                          guestSquad === "other"
                            ? "bg-red-500/10 border-red-500/40 text-red-400 font-black"
                            : "bg-[#0a0d16] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        OUTRA
                      </button>
                    </div>

                    {guestSquad === "other" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="pt-1"
                      >
                        <input
                          type="text"
                          required
                          placeholder="Informe sua Squad (ex: squad de faturamento)"
                          className="w-full bg-[#0a0d16] border border-slate-800 focus:border-red-500/50 rounded-lg px-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition"
                          value={customSquad}
                          onChange={(e) => setCustomSquad(e.target.value)}
                        />
                      </motion.div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>NOME EXATO DA WAR ROOM</span>
                      <span className="text-[10px] text-red-400">[PRÉ-CRIADA POR ADMIN]</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: WarRoom Lançamento Pix 2026"
                      className="w-full bg-[#0a0d16] border border-slate-800 focus:border-red-500/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-650 focus:outline-none transition"
                      value={warRoomName}
                      onChange={(e) => setWarRoomName(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={guestLoading}
                    className="w-full flex items-center justify-center gap-2 bg-red-650 hover:bg-red-600 disabled:bg-slate-800 disabled:text-slate-550 text-white font-semibold py-2.5 px-4 rounded-xl border border-red-500/20 shadow-[0_4px_15px_rgba(239,68,68,0.15)] transition cursor-pointer"
                  >
                    {guestLoading ? (
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Conectar e Entrar na Sala de Guerra
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      {/* Footer system names credits */}
      <footer className="p-6 flex flex-wrap items-center justify-between border-t border-white/[0.02] text-[#475569] text-[11px] font-mono gap-4">
        <div>
          AUTONOMIC CRITICAL METRICS BOARD v2.5.0
        </div>
        <div className="flex gap-4">
          <span>PROJECTS: FORCE_QA</span>
          <span>SYSTEM_WARROOM</span>
          <span>STRIKEBOARD</span>
        </div>
      </footer>
    </div>
  );
};
