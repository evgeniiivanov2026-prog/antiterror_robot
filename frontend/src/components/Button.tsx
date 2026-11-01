import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "danger" | "ghost" | "call";
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  to?: string;
  href?: string;
}

export function Button({ children, variant = "primary", disabled, type = "button", onClick, to, href }: ButtonProps) {
  const className = `btn btn-${variant}`;
  if (href) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  if (to) {
    return (
      <Link className={className} to={to}>
        {children}
      </Link>
    );
  }
  return (
    <button className={className} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
