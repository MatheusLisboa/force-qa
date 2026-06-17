import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types";
import { Shield, Sparkles, Terminal, Users, UserCheck } from "lucide-react";
import { motion } from "motion/react";

export const Onboarding: React.FC = () => {
  const { user, createProfile } = useAuth();
  const [name, setName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ""
  );
  const [squad, setSquad] = useState("");
  const [role, setRole] = useState<UserRole>("developer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Por favor, preencha o seu nome.");
      return;
    }
    if (!squad.trim()) {
      setError("Por favor, preencha a sua squad.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await createProfile(name.trim(), role, squad.trim());
    } catch (err: any) {
      setError("Erro ao criar perfil. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const rolesList: { value: UserRole; title: string; desc: string; icon: any }[] = [
    {
      value: "qa",
      title: "QA Engineer (Bug Hunter)",
      desc: "Cadastra bugs, valida correções e monitora relatórios de testes críticos.",
      icon: Sparkles,
    },
    {
      value: "developer",
      title: "Developer (Bug Smasher)",
      desc: "Assume responsabilidade por bugs, corrige status e adiciona comentários técnicos.",
      icon: Terminal,
    },
    {
      value: "admin",
      title: "Admin Commander",
      desc: "Gerencia canais de salas de guerra, configura parâmetros e analisa consolidados.",
      icon: Shield,
    },
    {
      value: "viewer",
      title: "Viewer (Observador)",
      desc: "Acompanha o progresso da operação em tempo real sem alterar statuses.",
      icon: Users,
    },
  ];

  return (
    <div className="fq-shell flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fq-auth-card max-w-2xl"
      >
        <div className="text-center mb-8">
          <div className="mb-4 inline-flex rounded-xl border p-3 text-neutral-300"
            style={{ backgroundColor: "var(--color-fq-elevated)", borderColor: "var(--color-fq-border)" }}
          >
            <UserCheck className="w-8 h-8" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Configurar Seu Perfil de Operações
          </h1>
          <p className="text-neutral-500 mt-2">
            Antes de acessar o ForceQA, configure suas credenciais de resposta tática rápida.
          </p>
        </div>

        {error && (
          <div className="fq-alert-error mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="fq-label fq-label--md">
                Nome de Guerra / Apelido
              </label>
              <input
                type="text"
                required
                className="fq-input"
                placeholder="Ex: Pedro QA, Dev Lucas"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="fq-label fq-label--md">
                Squad Principal
              </label>
              <input
                type="text"
                required
                className="fq-input"
                placeholder="Ex: Squad Pix, Squad Checkout"
                value={squad}
                onChange={(e) => setSquad(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="fq-label fq-label--md !mb-3">
              Selecione o seu Papel Operacional (Role)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rolesList.map((r) => {
                const IconComponent = r.icon;
                const isSelected = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`text-left p-4 rounded-lg border transition fq-surface ${
                      isSelected
                        ? "border-white/20 bg-white/[0.04]"
                        : "hover:border-white/12"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? "bg-white/10 text-neutral-100" : "bg-white/[0.06] text-neutral-400"}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className={`text-sm font-semibold ${isSelected ? "text-neutral-100" : "text-white"}`}>
                          {r.title}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                          {r.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="fq-btn-primary w-full md:w-auto px-6 font-semibold"
            >
              {submitting ? "Configurando Perfil..." : "Acessar Sistema ForceQA"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
