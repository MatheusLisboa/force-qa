import React from "react";
import { cx } from "./cx";

/** Item de menu/dropdown. Substitui a string de classes repetida em vários menus. */
export const MenuItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; danger?: boolean }
>(function MenuItem({ icon, danger, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      role="menuitem"
      className={cx(
        "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/[0.05] focus-visible:bg-white/[0.08]",
        danger ? "text-red-400" : "text-neutral-200",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
