import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import { getAuthErrorCode, getAuthErrorMessage } from "../lib/authErrors";
import { LogIn, AlertTriangle, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SquadSelect } from "./SquadSelect";

export const LoginScreen: React.FC = () => {
  const { loginWithEmail, loginAsGuest, requestPasswordReset } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<"email" | "guest">("email");

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Guest form state
  const [guestName, setGuestName] = useState("");
  const [guestSquad, setGuestSquad] = useState("");
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
      await loginWithEmail(email.trim(), password, false);
    } catch (err: unknown) {
      console.error(err);
      const code = getAuthErrorCode(err);
      const msg = getAuthErrorMessage(err);

      if (code === "invalid_credentials" || msg.includes("Invalid login credentials")) {
        setEmailError(
          "E-mail ou senha incorretos. Se não lembra a senha, use Recuperar senha."
        );
      } else if (code === "email_not_confirmed" || msg.includes("Email not confirmed")) {
        setEmailError(
          "E-mail não confirmado. Verifique sua caixa de entrada ou desative a confirmação no Supabase."
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

    const selectedSquad = guestSquad.trim();
    if (!selectedSquad) {
      setGuestError("Por favor, informe a sua área (ex: QA, Dev).");
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
        <div className="fq-header-brand">
          <div className="fq-brand-mark">FQ</div>
          <span className="fq-header-brand-name">ForceQA</span>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
          War room de QA
        </span>
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

            <div className="mb-5 inline-flex rounded-2xl border p-3"
              style={{ backgroundColor: "var(--color-fq-accent-muted)", borderColor: "rgba(45, 212, 191, 0.25)" }}
            >
              <div className="fq-brand-mark !h-10 !w-10 !text-sm">FQ</div>
            </div>
            
            <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-white mb-2">
              Entre para continuar
            </h1>
            <p className="text-neutral-400 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
              Use o e-mail cadastrado pelo admin. Convidado cola o link da sala.
            </p>
          </div>

          {/* Premium Selector Tabs */}
          <div className="fq-segmented mb-6 grid-cols-2 text-center text-sm font-medium">
            <button
              onClick={() => setActiveTab("email")}
              className={`fq-segment ${activeTab === "email" ? "fq-segment--active" : ""}`}
            >
              Entrar
            </button>
            <button
              onClick={() => setActiveTab("guest")}
              className={`fq-segment ${activeTab === "guest" ? "fq-segment--active" : ""}`}
            >
              Convidado
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
                  <div>
                    <label className="fq-label">E-mail</label>
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
                    <label className="fq-label">Senha</label>
                    <input
                      type="password"
                      required
                      className="fq-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end -mt-2">
                    <button
                      type="button"
                      disabled={resetLoading || !email.trim()}
                      onClick={async () => {
                        setEmailError("");
                        setResetSent(false);
                        setResetLoading(true);
                        try {
                          await requestPasswordReset(email);
                          setResetSent(true);
                        } catch (err: unknown) {
                          setEmailError(err instanceof Error ? err.message : "Não foi possível enviar o e-mail de recuperação.");
                        } finally {
                          setResetLoading(false);
                        }
                      }}
                      className="text-[11px] text-neutral-400 hover:text-neutral-200 font-mono"
                    >
                      {resetLoading ? "Enviando..." : "Esqueci a senha"}
                    </button>
                  </div>

                  {resetSent && (
                    <p className="text-[11px] text-emerald-400 font-mono">
                      Se o e-mail existir, você receberá o link para redefinir a senha.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="fq-btn-primary w-full"
                  >
                    {emailLoading ? (
                      <span className="w-5 h-5 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        Entrar
                      </>
                    )}
                  </button>
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
                    <label className="fq-label">Seu nome</label>
                    <input
                      type="text"
                      required
                      placeholder="Como você quer aparecer na sala"
                      className="fq-input"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="fq-label">Área</label>
                    <SquadSelect required value={guestSquad} onChange={setGuestSquad} />
                  </div>

                  <div>
                    <label className="fq-label">Link ou ID da sala</label>
                    <input
                      type="text"
                      required
                      placeholder="Cole o link da sala ou o ID"
                      className="fq-input"
                      value={warRoomName}
                      onChange={(e) => setWarRoomName(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={guestLoading}
                    className="fq-btn-primary w-full"
                  >
                    {guestLoading ? (
                      <span className="w-5 h-5 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Entrar na sala"
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};
