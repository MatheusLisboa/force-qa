import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { createWarRoom } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { WarRoom, Bug, SeverityLevel } from "../types";
import { 
  Radio, 
  Activity, 
  Plus, 
  AlertOctagon, 
  Server, 
  Clock, 
  ShieldAlert, 
  Layers, 
  ExternalLink, 
  CheckCircle,
  HelpCircle,
  TrendingUp,
  User,
  Share2,
  UserPlus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DashboardProps {
  onSelectRoom: (roomId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectRoom }) => {
  const { profile, adminCreateUser } = useAuth();
  const [warRooms, setWarRooms] = useState<WarRoom[]>([]);
  const [allBugs, setAllBugs] = useState<Bug[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // User Management State
  const [isAdminUsersModalOpen, setIsAdminUsersModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "qa" | "developer" | "dba" | "viewer">("developer");
  const [newUserSquad, setNewUserSquad] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreationError, setUserCreationError] = useState("");
  const [userCreationSuccess, setUserCreationSuccess] = useState("");
  const [usersList, setUsersList] = useState<any[]>([]);

  // Live real-time stream subscription for System Users
  useEffect(() => {
    if (profile?.role === "admin") {
      const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data());
        });
        setUsersList(list);
      });
      return () => unsubscribeUsers();
    }
  }, [profile]);

  const handleAdminCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim() || !newUserSquad.trim()) {
      setUserCreationError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    
    if (newUserPassword.length < 6) {
      setUserCreationError("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    setIsCreatingUser(true);
    setUserCreationError("");
    setUserCreationSuccess("");

    try {
      await adminCreateUser(
        newUserName.trim(),
        newUserEmail.trim(),
        newUserPassword,
        newUserRole,
        newUserSquad.trim()
      );
      setUserCreationSuccess(`Usuário ${newUserName.trim()} cadastrado com sucesso!`);
      // Reset form
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserSquad("");
    } catch (err: any) {
      console.error("Error creating user:", err);
      setUserCreationError(err.message || "Erro desconhecido ao cadastrar usuário.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Form states for creating a new room
  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  const [squad, setSquad] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SeverityLevel>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Live real-time stream subscription for War Rooms
  useEffect(() => {
    const qRooms = query(collection(db, "warRooms"), orderBy("createdAt", "desc"));
    const unsubscribeRooms = onSnapshot(qRooms, (snapshot) => {
      const rooms: WarRoom[] = [];
      snapshot.forEach((doc) => {
        rooms.push(doc.data() as WarRoom);
      });
      setWarRooms(rooms);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to war rooms:", error);
    });

    const unsubscribeBugs = onSnapshot(collection(db, "bugs"), (snapshot) => {
      const bugsList: Bug[] = [];
      snapshot.forEach((doc) => {
        bugsList.push(doc.data() as Bug);
      });
      setAllBugs(bugsList);
    }, (error) => {
      console.error("Error subscribing to bugs:", error);
    });

    return () => {
      unsubscribeRooms();
      unsubscribeBugs();
    };
  }, []);

  // Compute stats metrics dynamically
  const activeRooms = warRooms.filter(r => r.status === "active").length;
  const bugsCrit = {
    blocker: allBugs.filter(b => b.criticism === "blocker" && b.status !== "validated").length,
    critical: allBugs.filter(b => b.criticism === "critical" && b.status !== "validated").length,
    high: allBugs.filter(b => b.criticism === "high" && b.status !== "validated").length,
    medium: allBugs.filter(b => b.criticism === "medium" && b.status !== "validated").length,
    low: allBugs.filter(b => b.criticism === "low" && b.status !== "validated").length,
  };

  const bugsStatus = {
    open: allBugs.filter(b => b.status !== "validated").length,
    resolved: allBugs.filter(b => b.status === "validated").length,
    validating: allBugs.filter(b => b.status === "ready_for_qa").length,
  };

  // Calculate average resolution duration in minutes
  const validatedBugs = allBugs.filter(b => b.status === "validated" && b.resolvedAt && b.createdAt);
  let averageResolutionTimeStr = "--";
  if (validatedBugs.length > 0) {
    const totalDurationMs = validatedBugs.reduce((acc, b) => {
      const start = new Date(b.createdAt).getTime();
      const end = new Date(b.resolvedAt).getTime();
      return acc + (end - start);
    }, 0);
    const avgMinutes = Math.round(totalDurationMs / validatedBugs.length / 60000);
    averageResolutionTimeStr = avgMinutes > 60 
      ? `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m`
      : `${avgMinutes} min`;
  }

  // Developer with most active tasks
  const devTaskCount: { [name: string]: number } = {};
  allBugs.forEach((b) => {
    if (b.status !== "validated" && b.ownerName) {
      devTaskCount[b.ownerName] = (devTaskCount[b.ownerName] || 0) + 1;
    }
  });
  let topDevName = "Nenhum";
  let topDevCount = 0;
  Object.entries(devTaskCount).forEach(([name, count]) => {
    if (count > topDevCount) {
      topDevCount = count;
      topDevName = name;
    }
  });

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !project.trim() || !squad.trim()) {
      setFormError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const roomId = await createWarRoom({
        name: name.trim(),
        project: project.trim(),
        squad: squad.trim(),
        date,
        description: description.trim(),
        severity,
        status: "active",
        createdBy: profile?.id || "unknown",
        createdByName: profile?.name || "Anonymous Hunter"
      });
      
      // Reset form & close modal
      setName("");
      setProject("");
      setSquad("");
      setDescription("");
      setSeverity("medium");
      setIsModalOpen(false);

      // Automatically redirect user into newly created room
      onSelectRoom(roomId);
    } catch (err: any) {
      setFormError("Erro ao criar War Room: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyShareLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const relativeUrl = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(relativeUrl);
    alert("Link de compartilhamento rápido copiado para a área de transferência!");
  };

  return (
    <div className="space-y-8 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Upper header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/[0.04] pb-6">
        <div>
          <span className="font-mono text-xs tracking-wider text-red-500 uppercase font-semibold flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> OPERATIONAL COMMAND STATUS
          </span>
          <h1 className="font-display text-3xl font-extrabold text-white mt-1">
            Painel Central de QA
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Acompanhe o status tático de testes críticos e salas de guerra recomendadas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {profile?.role === "admin" && (
            <button
              onClick={() => setIsAdminUsersModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-650 hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.25)] text-white font-medium px-4 py-2.5 rounded-lg transition cursor-pointer text-xs font-mono border border-indigo-500/20"
            >
              <UserPlus className="w-4 h-4" />
              GERENCIAR USUÁRIOS
            </button>
          )}

          {profile?.role !== "viewer" && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.25)] text-white font-medium px-4 py-2.5 rounded-lg transition cursor-pointer text-xs font-mono border border-red-500/20"
            >
              <Plus className="w-4 h-4" />
              NOVA OPERAÇÃO
            </button>
          )}
        </div>
      </div>

      {/* Grid counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-[#0f172a]/60 border border-slate-800/80 p-5 rounded-xl flex items-center gap-4 relative overflow-hidden">
          <div className="p-3 bg-red-500/10 text-red-500 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400">Blockers & Críticos</span>
            <h2 className="text-2xl font-black text-white mt-0.5">
              {bugsCrit.blocker + bugsCrit.critical}
            </h2>
          </div>
          {bugsCrit.blocker > 0 && (
            <div className="absolute top-2 right-2 bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold animate-pulse">
              ALERTA
            </div>
          )}
        </div>

        {/* Metric 2 */}
        <div className="bg-[#0f172a]/60 border border-slate-800/80 p-5 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400">Total Bugs Abertos</span>
            <h2 className="text-2xl font-black text-white mt-0.5">{bugsStatus.open}</h2>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-[#0f172a]/60 border border-slate-800/80 p-5 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-green-500/10 text-green-400 rounded-lg">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400">Tempo Médio Resolução</span>
            <h2 className="text-2xl font-black text-white mt-0.5">{averageResolutionTimeStr}</h2>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-[#0f172a]/60 border border-slate-800/80 p-5 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <User className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400">Dev Mais Sobrecarregado</span>
            <h2 className="text-lg font-bold text-white mt-1 truncate max-w-[130px]" title={topDevName}>
              {topDevName === "Nenhum" ? "--" : `${topDevName} (${topDevCount})`}
            </h2>
          </div>
        </div>
      </div>

      {/* Mid Visual Graph Analytics Panel (Custom high-end SVG bars) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Severity chart */}
        <div className="lg:col-span-2 bg-[#0f172a]/40 border border-white/[0.04] p-6 rounded-2xl">
          <h3 className="font-display text-base font-bold text-white flex items-center gap-2 mb-6">
            <Activity className="w-4 h-4 text-red-500" />
            Vulnerabilidades por Severidade Geral (Sem Validar)
          </h3>
          
          <div className="space-y-4">
            {/* Blocker bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 font-mono mb-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]" /> BLOCKERS</span>
                <span className="font-bold text-slate-350">{bugsCrit.blocker} bugs</span>
              </div>
              <div className="h-2.5 w-full bg-[#111827] rounded-full overflow-hidden">
                <div className="h-full bg-red-650 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.blocker / (bugsStatus.open || 1)) * 100))}%` }} />
              </div>
            </div>

            {/* Critical bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 font-mono mb-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> CRÍTICOS</span>
                <span className="font-bold text-slate-350">{bugsCrit.critical} bugs</span>
              </div>
              <div className="h-2.5 w-full bg-[#111827] rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.critical / (bugsStatus.open || 1)) * 100))}%` }} />
              </div>
            </div>

            {/* High bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 font-mono mb-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> ALTOS</span>
                <span className="font-bold text-slate-350">{bugsCrit.high} bugs</span>
              </div>
              <div className="h-2.5 w-full bg-[#111827] rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.high / (bugsStatus.open || 1)) * 100))}%` }} />
              </div>
            </div>

            {/* Medium bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 font-mono mb-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /> MÉDIOS</span>
                <span className="font-bold text-slate-350">{bugsCrit.medium} bugs</span>
              </div>
              <div className="h-2.5 w-full bg-[#111827] rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.medium / (bugsStatus.open || 1)) * 100))}%` }} />
              </div>
            </div>

            {/* Low bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 font-mono mb-1.5">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> BAIXOS</span>
                <span className="font-bold text-slate-350">{bugsCrit.low} bugs</span>
              </div>
              <div className="h-2.5 w-full bg-[#111827] rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.low / (bugsStatus.open || 1)) * 100))}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Status ring or breakdown */}
        <div className="bg-[#0f172a]/40 border border-white/[0.04] p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-white flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-550" />
              Taxa de Resolução Global
            </h3>
            <p className="text-xs text-slate-450 leading-relaxed mb-6">
              Razão de eficácia de bugs validados e finalizados em relação ao total de relatos críticos.
            </p>
          </div>

          <div className="flex items-center justify-center p-4">
            <div className="relative flex items-center justify-center w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="64" cy="64" r="50" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
                <circle cx="64" cy="64" r="50" fill="transparent" stroke="#22c55e" strokeWidth="10" 
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - (bugsStatus.resolved / (allBugs.length || 1)))}`}
                  className="transition-all duration-1000 ease-out" 
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-black text-white">
                  {Math.round((bugsStatus.resolved / (allBugs.length || 1)) * 100)}%
                </span>
                <span className="text-[10px] uppercase font-mono text-slate-450">Resolvidos</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs font-mono text-[#94a3b8] mt-4 border-t border-white/[0.04] pt-4">
            <div>
              <span className="text-[#22c55e] font-bold">{bugsStatus.resolved}</span> validados
            </div>
            <div>
              <span className="text-red-400 font-bold">{bugsStatus.open}</span> abertos
            </div>
            <div>
              total: <span className="text-white font-bold">{allBugs.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active War Rooms Grid List */}
      <div>
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-1.5 mb-5 uppercase tracking-wide">
          <Server className="w-4 h-4 text-red-500" /> Salas de Guerra Ativas / Operações ({warRooms.length})
        </h3>

        {loading ? (
          <div className="text-center py-12 bg-[#0d1220]/50 border border-slate-800 rounded-xl">
            <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-slate-400 text-sm font-mono">Sincronizando Banco de Dados...</p>
          </div>
        ) : warRooms.length === 0 ? (
          <div className="text-center py-16 bg-[#000000]/20 border border-slate-800 rounded-xl">
            <AlertOctagon className="w-10 h-10 text-slate-650 mx-auto mb-3" />
            <h4 className="text-slate-200 font-bold font-display text-base">Nenhuma operação tática aberta</h4>
            <p className="text-slate-550 text-xs mt-1 max-w-sm mx-auto">
              Tudo limpo por aqui. Caso ocorra um incidente crítico, crie uma nova War Room para coordenar as correções com o time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {warRooms.map((room) => {
              const activeRoomBugs = allBugs.filter(b => b.warRoomId === room.id);
              const roomBlocker = activeRoomBugs.filter(b => b.criticism === "blocker" && b.status !== "validated").length;
              const roomTotalOpen = activeRoomBugs.filter(b => b.status !== "validated").length;
              const roomResolved = activeRoomBugs.filter(b => b.status === "validated").length;

              return (
                <div 
                  key={room.id}
                  onClick={() => onSelectRoom(room.id)}
                  className="group bg-[#0d1220]/75 hover:bg-[#111827]/90 hover:border-red-500/30 border border-slate-800 transition-all duration-150 rounded-xl p-5 shadow-lg relative cursor-pointer flex flex-col justify-between min-h-[195px]"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-display font-extrabold text-white group-hover:text-red-400 text-lg transition tracking-tight truncate max-w-[180px]" title={room.name}>
                        {room.name}
                      </h4>
                      <span className={`p-1 px-2 text-[10px] font-mono tracking-wider uppercase font-extrabold rounded ${
                        room.status === "active" 
                          ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                          : room.status === "paused"
                            ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}>
                        {room.status === "active" ? "ATIVO" : room.status === "paused" ? "PAUSADO" : "ENCERRADO"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-450 font-mono">
                      <span>PROJECT: <span className="text-slate-300 font-semibold">{room.project}</span></span>
                      <span>•</span>
                      <span>SQUAD: <span className="text-slate-300 font-semibold">{room.squad}</span></span>
                    </div>

                    <p className="text-xs text-slate-400 mt-3 line-clamp-2 leading-relaxed" title={room.description}>
                      {room.description || "Nenhuma descrição operacional adicional foi especificada preliminarmente."}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-850 flex justify-between items-center">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <span className="block text-[10px] font-mono uppercase text-slate-450">Abertos</span>
                        <span className={`text-sm font-black ${roomTotalOpen > 0 ? "text-white" : "text-slate-500"}`}>{roomTotalOpen}</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-mono uppercase text-slate-450">Falta QA</span>
                        <span className={`text-sm font-black ${activeRoomBugs.filter(b => b.status === "ready_for_qa").length > 0 ? "text-yellow-400" : "text-slate-500"}`}>
                          {activeRoomBugs.filter(b => b.status === "ready_for_qa").length}
                        </span>
                      </div>
                      {roomBlocker > 0 && (
                        <div className="text-center">
                          <span className="block text-[10px] font-mono uppercase text-[#e11d48]">BLOCKER</span>
                          <span className="text-sm font-black text-[#e11d48] animate-pulse">{roomBlocker}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={(e) => copyShareLink(room.id, e)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-705 cursor-pointer"
                        title="Compartilhar Link da Sala"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="p-1 px-2 text-[10px] font-mono text-slate-450 flex items-center gap-1 group-hover:text-red-400 transition">
                        ENTRAR <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Creation WarRoom Modal Overlay */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080b13]/85 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-[#0d1220] border border-[#1e293b] rounded-2xl shadow-2xl p-6 relative"
            >
              <div className="flex justify-between items-center border-b border-white/[0.04] pb-4 mb-5">
                <h3 className="font-display text-xl font-extrabold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-500" /> Nova Operação / War Room
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  X
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-red-900/20 border border-red-500/20 text-red-400 text-xs rounded-lg mb-4">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4 text-sm text-slate-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 font-mono mb-1.5">
                      Nome da Operação *
                    </label>
                    <input
                      required
                      type="text"
                      className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition"
                      placeholder="Ex: WarRoom Incidente Pix"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 font-mono mb-1.5">
                      Projeto / Sistema Sob Teste *
                    </label>
                    <input
                      required
                      type="text"
                      className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition"
                      placeholder="Ex: App Android Checkout"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 font-mono mb-1.5">
                      Squad Principal *
                    </label>
                    <input
                      required
                      type="text"
                      className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition"
                      placeholder="Ex: Squad Core-Payments"
                      value={squad}
                      onChange={(e) => setSquad(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 font-mono mb-1.5">
                      Data da Sala de Guerra
                    </label>
                    <input
                      type="date"
                      className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-3 py-2 text-white focus:outline-none transition"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 font-mono mb-1.5">
                    Descrição do Escopo operacional
                  </label>
                  <textarea
                    rows={3}
                    className="w-full bg-[#0f172a] border border-slate-800 focus:border-red-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition"
                    placeholder="Especifique o contexto do incidente e escopo dos testes..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 font-mono mb-1.5">
                    Severidade Geral Prevista
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {(["blocker", "critical", "high", "medium", "low"] as SeverityLevel[]).map((level) => {
                      const isSelected = severity === level;
                      const levelColors: any = {
                        blocker: "border-red-600 hover:bg-red-950/20 text-red-500 bg-red-950/10",
                        critical: "border-red-500 hover:bg-red-900/20 text-red-400 bg-red-900/10",
                        high: "border-orange-500 hover:bg-orange-950/10 text-orange-400 bg-orange-950/5",
                        medium: "border-yellow-500 hover:bg-yellow-950/10 text-yellow-400 bg-yellow-950/5",
                        low: "border-blue-500 hover:bg-blue-950/10 text-blue-400 bg-blue-950/5"
                      };
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setSeverity(level)}
                          className={`py-1.5 text-xs font-mono font-bold uppercase border rounded-md transition cursor-pointer text-center ${
                            isSelected 
                              ? `${levelColors[level]} scale-102 border-current shadow-[0_0_10px_rgba(239,68,68,0.1)]` 
                              : "border-slate-800 hover:border-slate-700 bg-transparent text-slate-450"
                          }`}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.04] flex justify-end gap-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800/80 hover:bg-slate-750 text-slate-350 rounded-lg cursor-pointer text-center"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-red-650 hover:bg-red-650/90 text-white rounded-lg shadow-md transition cursor-pointer text-center"
                  >
                    {submitting ? "Iniciando Sala..." : "Iniciar Incidente"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin User Management Modal Overview */}
      <AnimatePresence>
        {isAdminUsersModalOpen && profile?.role === "admin" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080b13]/85 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-[#0d1220]/95 border border-[#1e293b] rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-white/[0.04] pb-4 mb-5">
                <h3 className="font-display text-xl font-extrabold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-500" /> Painel de Registro & Controle de Usuários
                </h3>
                <button 
                  onClick={() => {
                    setIsAdminUsersModalOpen(false);
                    setUserCreationError("");
                    setUserCreationSuccess("");
                  }}
                  className="p-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded text-xs font-mono font-bold transition cursor-pointer"
                >
                  FECHAR (ESC)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-slate-350">
                {/* Panel 1: Creation form */}
                <div className="space-y-4">
                  <div className="border-b border-white/[0.03] pb-2">
                    <h4 className="font-mono text-xs font-bold uppercase text-indigo-400 tracking-wider">
                      ➕ ADICIONAR NOVO INTEGRANTE AO OPERATIVO
                    </h4>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      Registre credenciais de acesso locais para agentes da mesa de comando da ForceQA.
                    </p>
                  </div>

                  {userCreationError && (
                    <div className="p-3 bg-red-900/20 border border-red-550/20 text-red-100 text-xs rounded-lg font-mono">
                      ❌ {userCreationError}
                    </div>
                  )}

                  {userCreationSuccess && (
                    <div className="p-3 bg-green-950/25 border border-green-500/20 text-green-350 text-xs rounded-lg font-mono">
                      ✅ {userCreationSuccess}
                    </div>
                  )}

                  <form onSubmit={handleAdminCreateUserSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">
                        Nome Completo
                      </label>
                      <input
                        required
                        type="text"
                        className="w-full bg-[#05070a] border border-slate-800 focus:border-indigo-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition text-xs font-mono"
                        placeholder="Ex: Matheus Lisboa"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">
                        Endereço de E-mail (Acesso)
                      </label>
                      <input
                        required
                        type="email"
                        className="w-full bg-[#05070a] border border-slate-800 focus:border-indigo-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition text-xs font-mono"
                        placeholder="Ex: matheus@forceqa.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">
                        Senha Inicial (Mínimo de 6 caracteres)
                      </label>
                      <input
                        required
                        type="password"
                        className="w-full bg-[#05070a] border border-slate-800 focus:border-indigo-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition text-xs font-mono"
                        placeholder="Ex: senhatemporaria"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">
                          Função Operacional
                        </label>
                        <select
                          className="w-full bg-[#05070a] border border-slate-800 focus:border-indigo-500/50 rounded-lg px-2 py-2 text-white focus:outline-none transition text-xs font-mono"
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as any)}
                        >
                          <option value="developer">Developer (DEV)</option>
                          <option value="qa">QA Analyst (QA)</option>
                          <option value="dba">Database Admin (DBA)</option>
                          <option value="admin">Administrator (ADMIN)</option>
                          <option value="viewer">Viewer (OBS/VIEWER)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">
                          Squad de Atuação
                        </label>
                        <input
                          required
                          type="text"
                          className="w-full bg-[#05070a] border border-slate-800 focus:border-indigo-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition text-xs font-mono"
                          placeholder="Ex: Squad Pix"
                          value={newUserSquad}
                          onChange={(e) => setNewUserSquad(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isCreatingUser}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_10px_rgba(99,102,241,0.25)] text-white text-xs font-bold uppercase font-mono tracking-wider rounded-lg transition disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer text-center"
                      >
                        {isCreatingUser ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            CADASTRANDO INTEGRANTE...
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            CADASTRAR E VALIDAR CONTA
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Panel 2: Live Registered Members List */}
                <div className="space-y-4 flex flex-col justify-start">
                  <div className="border-b border-white/[0.03] pb-2">
                    <h4 className="font-mono text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center justify-between">
                      <span>👥 AGENTES OPERATIVOS ATIVOS ({usersList.length})</span>
                      <span className="text-[9px] text-green-500 uppercase font-black tracking-widest">[SINCRONIZADO]</span>
                    </h4>
                    <p className="text-slate-450 text-[11px] mt-0.5 leading-relaxed">
                      Todos os usuários cadastrados e habilitados na mesa tática da ForceQA.
                    </p>
                  </div>

                  <div className="overflow-y-auto pr-1 space-y-2 max-h-[350px]">
                    {usersList.length === 0 ? (
                      <div className="text-center py-10 bg-slate-950/40 border border-slate-900 rounded-xl">
                        <span className="text-xs text-slate-500 font-mono">Buscando lista de agentes...</span>
                      </div>
                    ) : (
                      usersList.map((usr: any) => {
                        const roleColor = usr.role === "admin" 
                          ? "text-red-450 bg-red-950/20 border-red-900/30" 
                          : usr.role === "dba" 
                            ? "text-cyan-400 bg-cyan-950/20 border-cyan-900/30" 
                            : usr.role === "qa"
                              ? "text-green-400 bg-green-950/20 border-green-900/30"
                              : usr.role === "developer"
                                ? "text-orange-400 bg-orange-950/20 border-orange-900/30"
                                : "text-slate-400 bg-slate-800/40 border-slate-700/30";

                        const roleLabel = usr.role === "admin" 
                          ? "ADMIN" 
                          : usr.role === "dba" 
                            ? "DBA" 
                            : usr.role === "qa" 
                              ? "QA" 
                              : usr.role === "developer" 
                                ? "DEV" 
                                : "OBS/VIEWER";

                        return (
                          <div 
                            key={usr.id} 
                            className="p-3 bg-[#05070a]/60 border border-slate-900 rounded-xl flex items-center justify-between hover:bg-slate-950/90 transition group"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-xs">{usr.name}</span>
                                <span className={`px-1.5 py-0.5 text-[8.5px] font-black tracking-wide font-mono rounded border uppercase ${roleColor}`}>
                                  {roleLabel}
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 leading-none">
                                {usr.email}
                              </div>
                            </div>
                            <div className="text-right font-mono text-[9px] uppercase text-slate-400 bg-[#0a0d16] border border-slate-900 py-0.5 px-2 rounded-md">
                              {usr.squad || "Sem Squad"}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
