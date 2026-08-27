import React, { useState } from "react";
import { isKnownSquad, normalizeArea, SQUAD_PRESETS } from "../lib/squads";

interface SquadSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
}

export const SquadSelect: React.FC<SquadSelectProps> = ({
  value,
  onChange,
  required = false,
  className = "fq-input",
  id,
}) => {
  const displayValue = normalizeArea(value);
  const isPreset = !displayValue || isKnownSquad(displayValue);
  const [mode, setMode] = useState<"preset" | "custom">(isPreset ? "preset" : "custom");

  if (mode === "custom") {
    return (
      <div className="space-y-2">
        <input
          id={id}
          required={required}
          type="text"
          className={className}
          placeholder="Nome da área"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="text-[11px] font-mono text-neutral-500 hover:text-neutral-300"
          onClick={() => {
            setMode("preset");
            onChange("");
          }}
        >
          ← Voltar para a lista
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      required={required}
      className={className}
      value={displayValue}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "__custom__") {
          setMode("custom");
          onChange("");
          return;
        }
        onChange(next);
      }}
    >
      <option value="">Selecione a área...</option>
      {SQUAD_PRESETS.map((squad) => (
        <option key={squad} value={squad}>
          {squad}
        </option>
      ))}
      <option value="__custom__">Outra área</option>
    </select>
  );
};
