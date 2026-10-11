import React from "react";
import { cx } from "./cx";

const SIZE: Record<"xs" | "sm" | "md", string> = {
  xs: "h-5 w-5 text-[10px] rounded-md",
  sm: "h-6 w-6 text-[10px] rounded-md",
  md: "h-8 w-8 text-sm rounded-md",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Avatar: React.FC<{ name: string; size?: "xs" | "sm" | "md"; className?: string }> = ({
  name,
  size = "sm",
  className,
}) => (
  <span
    aria-hidden
    className={cx(
      "inline-flex shrink-0 items-center justify-center border border-white/[0.06] bg-white/[0.08] font-semibold text-neutral-200",
      SIZE[size],
      className
    )}
  >
    {initialsOf(name)}
  </span>
);
