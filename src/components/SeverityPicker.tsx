import React from "react";
import { SeverityLevel } from "../types";
import { SEVERITY_CONFIG } from "../lib/bugLabels";

const LEVELS: SeverityLevel[] = [
  "blocker",
  "critical",
  "high",
  "medium",
  "low",
];

interface SeverityPickerProps {
  value: SeverityLevel;
  onChange: (level: SeverityLevel) => void;
}

export const SeverityPicker: React.FC<SeverityPickerProps> = ({
  value,
  onChange,
}) => {
  return (
    <div className="fq-severity-picker">
      {LEVELS.map((level) => {
        const config = SEVERITY_CONFIG[level];
        const isSelected = value === level;

        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`fq-severity-option ${
              isSelected ? `fq-severity-option--selected ${config.className}` : ""
            }`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
};
