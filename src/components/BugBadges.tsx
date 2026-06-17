import React from "react";
import { BugStatus, SeverityLevel } from "../types";
import {
  getSeverityConfig,
  getStatusConfig,
  getUserRoleConfig,
  getRoomStatusConfig,
  getRoomTypeConfig,
  WarRoomStatus,
  RoomType,
} from "../lib/bugLabels";

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 tracking-wide",
  md: "text-[11px] px-2 py-0.5",
} as const;

interface BadgeSizeProps {
  size?: keyof typeof SIZE_CLASSES;
}

export const SeverityBadge: React.FC<
  { severity: SeverityLevel } & BadgeSizeProps
> = ({ severity, size = "sm" }) => {
  const config = getSeverityConfig(severity);
  return (
    <span
      className={`fq-badge font-mono font-bold uppercase ${config.className} ${SIZE_CLASSES[size]}`}
    >
      {config.label}
    </span>
  );
};

export const StatusBadge: React.FC<
  { status: BugStatus } & BadgeSizeProps
> = ({ status, size = "sm" }) => {
  const config = getStatusConfig(status);
  return (
    <span
      className={`fq-badge font-mono font-semibold uppercase ${config.className} ${SIZE_CLASSES[size]}`}
    >
      {config.label}
    </span>
  );
};

export const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const config = getUserRoleConfig(role);
  return (
    <span
      className={`fq-badge font-mono font-bold uppercase text-[9px] px-1.5 py-0.5 tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
};

export const RoomStatusBadge: React.FC<{ status: WarRoomStatus }> = ({ status }) => {
  const config = getRoomStatusConfig(status);
  return (
    <span className={`fq-badge font-mono font-bold uppercase ${config.className}`}>
      {config.label}
    </span>
  );
};

export const RoomTypeBadge: React.FC<{
  type: RoomType;
  permanent?: boolean;
}> = ({ type, permanent = false }) => {
  const config = getRoomTypeConfig(type);
  const label =
    type === "board" && permanent ? "BOARD PERMANENTE" : config.label;

  return (
    <span className={`fq-badge font-mono font-bold uppercase ${config.className}`}>
      {label}
    </span>
  );
};
