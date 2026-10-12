import React, { useEffect, useState } from "react";
import { Copy, Globe, Lock, ShieldCheck } from "lucide-react";
import type { WarRoom } from "../types";
import { useToast } from "../context/ToastContext";
import { fetchGuestInviteInfo, rotateGuestInviteUrl, setGuestInviteExpiry, updateWarRoom } from "../lib/services";
import { describeInviteExpiry, INVITE_VALIDITY_OPTIONS } from "../lib/guestInvite";
import {
  GUEST_PERMISSION_LABEL,
  parseGuestPermission,
  parseRoomVisibility,
  ROOM_VISIBILITY_LABEL,
  type GuestPermission,
  type RoomVisibility,
} from "../lib/roomAccess";
import { logger } from "../lib/logger";

interface RoomAccessSettingsProps {
  roomId: string;
  warRoom: WarRoom;
  /** Quem pode mudar visibilidade e permissão dos convidados (admin da org ou criador da sala). */
  canEdit: boolean;
  /** Quem pode gerenciar o link de convidado. */
  canManageInvite: boolean;
}

/** Quem entra na sala, o que o convidado pode fazer e por quanto tempo o link vale. */
export const RoomAccessSettings: React.FC<RoomAccessSettingsProps> = ({ roomId, warRoom, canEdit, canManageInvite }) => {
  const { toast } = useToast();
  const visibility = parseRoomVisibility(warRoom.visibility);
  const guestPermission = parseGuestPermission(warRoom.guestPermission, "read");
  // undefined = carregando, null = sem validade, "error" = não deu para ler.
  const [expiresAt, setExpiresAt] = useState<string | null | undefined | "error">(undefined);
  const [validityDays, setValidityDays] = useState<string>("7");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManageInvite) return;
    let alive = true;
    fetchGuestInviteInfo(roomId)
      .then((info) => alive && setExpiresAt(info.expiresAt))
      .catch(() => alive && setExpiresAt("error"));
    return () => {
      alive = false;
    };
  }, [roomId, canManageInvite]);

  const days = validityDays === "none" ? null : Number(validityDays);

  const save = async (fields: Partial<Pick<WarRoom, "visibility" | "guestPermission">>, message: string) => {
    try {
      await updateWarRoom(roomId, fields);
      toast(message, { kind: "success" });
    } catch (err) {
      logger.error("RoomAccessSettings:", err);
      toast("Não foi possível salvar. Verifique sua permissão.", { kind: "error" });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const renew = async () => {
    setBusy(true);
    try {
      const url = await rotateGuestInviteUrl(roomId, window.location.origin, days);
      const info = await fetchGuestInviteInfo(roomId).catch(() => null);
      setExpiresAt(info?.expiresAt ?? null);
      const copied = await copy(url);
      toast(`Link novo ${copied ? "copiado" : "gerado"}. O anterior deixou de valer.`, { kind: "success" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível renovar o convite.", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const applyValidity = async () => {
    setBusy(true);
    try {
      await setGuestInviteExpiry(roomId, days);
      const info = await fetchGuestInviteInfo(roomId).catch(() => null);
      setExpiresAt(info?.expiresAt ?? null);
      toast("Validade do link atual atualizada.", { kind: "success" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível alterar a validade.", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="w-full basis-full space-y-3 border-t border-white/[0.06] pt-3" aria-label="Acesso à sala" data-testid="room-access">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-300">
        <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" aria-hidden /> Acesso à sala
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="fq-label fq-label--xs flex items-center gap-1" htmlFor="room-visibility">
            {visibility === "members" ? <Lock className="h-3 w-3" aria-hidden /> : <Globe className="h-3 w-3" aria-hidden />}
            Quem pode entrar
          </label>
          <select
            id="room-visibility"
            className="fq-select text-xs"
            value={visibility}
            disabled={!canEdit}
            onChange={(e) => {
              const next = e.target.value as RoomVisibility;
              void save({ visibility: next }, next === "members" ? "Sala restrita: só entra quem for adicionado ou convidado." : "Sala aberta à organização.");
            }}
          >
            {(Object.keys(ROOM_VISIBILITY_LABEL) as RoomVisibility[]).map((key) => (
              <option key={key} value={key}>{ROOM_VISIBILITY_LABEL[key].label}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{ROOM_VISIBILITY_LABEL[visibility].hint}</p>
        </div>

        <div>
          <label className="fq-label fq-label--xs" htmlFor="room-guest-permission">O que o convidado pode fazer</label>
          <select
            id="room-guest-permission"
            className="fq-select text-xs"
            value={guestPermission}
            disabled={!canEdit}
            onChange={(e) => {
              const next = e.target.value as GuestPermission;
              void save({ guestPermission: next }, next === "write" ? "Convidados agora criam e editam os próprios cards." : "Convidados agora só leem e comentam.");
            }}
          >
            {(Object.keys(GUEST_PERMISSION_LABEL) as GuestPermission[]).map((key) => (
              <option key={key} value={key}>{GUEST_PERMISSION_LABEL[key].label}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            {GUEST_PERMISSION_LABEL[guestPermission].hint}
            {guestPermission === "write" && " O convidado só edita os cards que ele mesmo criou."}
          </p>
        </div>
      </div>

      {canManageInvite && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="fq-label fq-label--xs" htmlFor="room-invite-validity">Validade do link de convidado</label>
            <select
              id="room-invite-validity"
              className="fq-select text-xs"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
            >
              {INVITE_VALIDITY_OPTIONS.map((option) => (
                <option key={option.label} value={option.days === null ? "none" : String(option.days)}>{option.label}</option>
              ))}
            </select>
          </div>
          <button type="button" className="fq-btn-secondary text-xs" onClick={() => void renew()} disabled={busy}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Gerar link novo
          </button>
          <button type="button" className="fq-btn-ghost text-xs" onClick={() => void applyValidity()} disabled={busy}>
            Aplicar ao link atual
          </button>
          <p className="basis-full text-[11px] text-neutral-500" data-testid="invite-expiry">
            Link atual: {expiresAt === undefined ? "carregando…" : expiresAt === "error" ? "não foi possível ler a validade" : describeInviteExpiry(expiresAt)}. Gerar um link novo invalida o anterior.
          </p>
        </div>
      )}
    </section>
  );
};
