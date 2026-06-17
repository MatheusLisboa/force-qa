import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import { getAuthErrorCode, getAuthErrorMessage, isUserAlreadyRegistered } from "../lib/authErrors";
import { LogIn, Sparkles, AlertTriangle, ShieldCheck, Zap, Mail, UserPlus, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const LoginScreen: React.FC = () => {
  const { loginWithEmail, signUpUser, loginAsGuest } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<"email" | "guest">("email");

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Sign up fields state
  const [signUpName, setSignUpName] = useState("");
  const [signUpRole, setSignUpRole] = useState<"qa" | "developer" | "dba" | "devops" | "scrum_master">("qa");
  const [signUpSquad, setSignUpSquad] = useState("");

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
      if (isSignUp) {
        if (!signUpName.trim()) {
          setEmailError("Por favor, informe seu nome completo.");
          setEmailLoading(false);
          return;
        }
        const finalSquad = signUpSquad.trim() || `Squad ${signUpRole.toUpperCase()}`;
        await signUpUser(signUpName, email, password, signUpRole, finalSquad);
      } else {
        await loginWithEmail(email.trim(), password, false);
      }
    } catch (err: unknown) {
      console.error(err);
      const code = getAuthErrorCode(err);
      const msg = getAuthErrorMessage(err);

      if (code === "invalid_credentials" || msg.includes("Invalid login credentials")) {
        setEmailError(
          "E-mail ou senha incorretos. Se você já tentou cadastrar antes, exclua o usuário em Supabase → Authentication → Users e tente de novo."
        );
      } else if (code === "email_not_confirmed" || msg.includes("Email not confirmed")) {
        setEmailError(
          "E-mail não confirmado. Verifique sua caixa de entrada ou desative a confirmação no Supabase."
        );
      } else if (isUserAlreadyRegistered(err)) {
        setEmailError(
          "Este e-mail já está registrado. Use a opção de login abaixo (não cadastro). Se não lembra a senha, exclua o usuário no Supabase e cadastre de novo."
        );
      } else if (code === "weak_password" || msg.toLowerCase().includes("password")) {
        setEmailError("Senha fraca. Use no mínimo 6 caracteres.");
      } else if (code === "invalid_email" || msg.toLowerCase().includes("invalid email")) {
        setEmailError("Endereço de e-mail inválido.");
      } else if (msg.includes("row-level security") || msg.includes("RLS") || msg.includes("perfil")) {
        setEmailError(msg);
      } else {
        setEmailError(msg || "Erro ao autenticar. Tente novamente.");
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
      setGuestError("Por favor, digite o ID da WarRoom que deseja entrar.");
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
    <div className="fq-shell relative flex min-h-screen flex-col justify-between overflow-hidden">
      <div className="fq-header z-10 !relative">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-semibold text-neutral-300"
            style={{ backgroundColor: "var(--color-fq-elevated)", borderColor: "var(--color-fq-border)" }}
          >
            FQ
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-white">
            ForceQA
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          SYSTEM_ONLINE // DEPLOY_HOT
        </div>
      </div>

      <main className="z-10 flex flex-1 items-center justify-center px-4 py-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="fq-auth-card max-w-lg"
        >
          <div className="text-center">
            {!isSupabaseConfigured() && (
              <div className="p-3 bg-amber-900/25 border border-amber-500/30 text-amber-300 text-xs rounded-lg mb-4 text-left font-mono leading-relaxed">
                <strong className="text-amber-200">Supabase não configurado neste deploy.</strong>
                <br />
                Na Vercel, adicione <code>VITE_SUPABASE_URL</code> e{" "}
                <code>VITE_SUPABASE_ANON_KEY</code> (com prefixo VITE_) e faça um{" "}
                <strong>novo deploy</strong> — variáveis só entram no build, não em runtime.
              </div>
            )}

            <div className="mb-4 inline-flex rounded-xl border p-3 text-neutral-300"
              style={{ backgroundColor: "var(--color-fq-elevated)", borderColor: "var(--color-fq-border)" }}
            >
              <ShieldCheck className="h-8 w-8" />
            </div>
            
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white mb-1">
              ForceQA <span className="text-red-500 font-light">StrikeBoard</span>
            </h1>
            <p className="text-neutral-500 text-xs max-w-sm mx-auto mb-6 leading-relaxed">
              Plataforma de guerra ágil e em tempo real para controle tático de bugs críticos.
            </p>
          </div>

          {/* Premium Selector Tabs */}
          <div className="fq-segmented mb-6 grid-cols-2 text-center font-mono text-[11px] font-bold">
            <button
              onClick={() => setActiveTab("email")}
              className={`fq-segment ${activeTab === "email" ? "fq-segment--active" : ""}`}
            >
              E-MAIL
            </button>
            <button
              onClick={() => setActiveTab("guest")}
              className={`fq-segment ${activeTab === "guest" ? "fq-segment--active" : ""}`}
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
                  <div className="fq-alert-error mb-4 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{emailError}</span>
                  </div>
                )}

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  {isSignUp && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-4 overflow-hidden pt-1 pb-2"
                    >
                      <div>
                        <label className="fq-label">NOME COMPLETO</label>
                        <input
                          type="text"
                          required={isSignUp}
                          className="fq-input font-sans"
                          placeholder="Ex: Matheus Lisboa"
                          value={signUpName}
                          onChange={(e) => setSignUpName(e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="fq-label">TIME / FUNÇÃO</label>
                          <select
                            className="fq-select font-mono text-sm"
                            value={signUpRole}
                            onChange={(e) => setSignUpRole(e.target.value as any)}
                          >
                            <option value="qa">QA</option>
                            <option value="developer">DEV</option>
                            <option value="dba">DBA</option>
                            <option value="devops">DEVOPS</option>
                            <option value="scrum_master">SCRUM MASTER</option>
                          </select>
                        </div>

                        <div>
                          <label className="fq-label">SQUAD DE ATUAÇÃO</label>
                          <input
                            type="text"
                            required={isSignUp}
                            className="fq-input font-mono"
                            placeholder="Ex: Squad Pix"
                            value={signUpSquad}
                            onChange={(e) => setSignUpSquad(e.target.value)}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div>
                    <label className="fq-label">E-MAIL CORPORATIVO / PESSOAL</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        className="fq-input pl-10"
                        placeholder="Ex: dba@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-neutral-500" />
                    </div>
                  </div>

                  <div>
                    <label className="fq-label">SENHA DE ACESSO</label>
                    <input
                      type="password"
                      required
                      className="fq-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="fq-btn-primary w-full font-semibold"
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
                    <label className="fq-label">SEU NOME COMPLETO</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Rodrigo Silva, Ana Souza"
                      className="fq-input"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="fq-label !mb-2">SUA SQUAD OPERACIONAL</label>
                    <div className="grid grid-cols-3 gap-2.5 mb-2 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => setGuestSquad("dev")}
                        className={`fq-filter-chip w-full justify-center font-mono font-bold cursor-pointer py-2 ${
                          guestSquad === "dev" ? "!bg-white/[0.08] !border-white/[0.16] text-neutral-100" : ""
                        }`}
                      >
                        DEV
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuestSquad("dba")}
                        className={`fq-filter-chip w-full justify-center font-mono font-bold cursor-pointer py-2 ${
                          guestSquad === "dba" ? "!bg-white/[0.08] !border-white/[0.16] text-neutral-100" : ""
                        }`}
                      >
                        DBA
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuestSquad("other")}
                        className={`fq-filter-chip w-full justify-center font-mono font-bold cursor-pointer py-2 ${
                          guestSquad === "other" ? "!bg-white/[0.08] !border-white/[0.16] text-neutral-100" : ""
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
                          className="fq-input text-xs"
                          value={customSquad}
                          onChange={(e) => setCustomSquad(e.target.value)}
                        />
                      </motion.div>
                    )}
                  </div>

                  <div>
                    <label className="fq-label fq-label--inline justify-between w-full">
                      <span>ID DA WAR ROOM</span>
                      <span className="text-[10px] text-red-400">[PRÉ-CRIADA POR ADMIN]</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ab709841-a010-41da-a7a2-dfb8a6e7c2eb"
                      className="fq-input"
                      value={warRoomName}
                      onChange={(e) => setWarRoomName(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={guestLoading}
                    className="fq-btn-primary w-full font-semibold"
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
      <footer className="fq-footer z-10 flex flex-wrap items-center justify-between gap-4">
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
