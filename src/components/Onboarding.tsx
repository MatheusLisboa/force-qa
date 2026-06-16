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
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] px-4 py-12 relative overflow-hidden room-banner-glow">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.03),transparent_70%)] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl bg-[#111827]/85 border border-[#1e293b] backdrop-blur-md rounded-2xl p-8 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 mb-4 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
            <UserCheck className="w-8 h-8" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Configurar Seu Perfil de Operações
          </h1>
          <p className="text-[#94a3b8] mt-2">
            Antes de acessar o ForceQA, configure suas credenciais de resposta tática rápida.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-550/30 text-red-400 text-sm rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Nome de Guerra / Apelido
              </label>
              <input
                type="text"
                required
                className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none transition group-focus:border-red-500"
                placeholder="Ex: Pedro QA, Dev Lucas"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Squad Principal
              </label>
              <input
                type="text"
                required
                className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none transition"
                placeholder="Ex: Squad Pix, Squad Checkout"
                value={squad}
                onChange={(e) => setSquad(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
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
                    className={`text-left p-4 rounded-xl border transition ${
                      isSelected
                        ? "bg-red-500/5 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                        : "bg-[#0f172a]/60 border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? "bg-red-500/10 text-red-400" : "bg-slate-800 text-slate-400"}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className={`text-sm font-semibold ${isSelected ? "text-red-400" : "text-white"}`}>
                          {r.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {r.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full md:w-auto bg-red-600 hover:bg-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:bg-slate-805 disabled:text-slate-500 text-white font-semibold rounded-lg px-6 py-3 transition duration-200 cursor-pointer text-center"
            >
              {submitting ? "Configurando Perfil..." : "Acessar Sistema ForceQA"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
