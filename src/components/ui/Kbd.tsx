import React from "react";

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="fq-kbd">{children}</kbd>
);
