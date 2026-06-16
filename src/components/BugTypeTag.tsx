import React from "react";
import { BugType } from "../types";
import { getBugTypeConfig } from "../lib/bugLabels";

interface BugTypeTagProps {
  type: BugType;
  size?: "sm" | "md";
}

export const BugTypeTag: React.FC<BugTypeTagProps> = ({ type, size = "sm" }) => {
  const config = getBugTypeConfig(type);
  const sizeClass =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center font-medium rounded border shrink-0 ${config.className} ${sizeClass}`}
    >
      {config.label}
    </span>
  );
};
