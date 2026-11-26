import type { ReactNode } from "react";
import { GoogleIcon, FacebookIcon } from "./icons";

interface SocialLoginButtonProps {
  href: string;
  children: ReactNode;
  className?: string;
}

/** Nút "Sign in with Google" đúng kiểu dáng chính thức (Google Identity Branding Guidelines). */
export function GoogleLoginButton({ href, children, className = "" }: SocialLoginButtonProps) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-10 items-center gap-2.5 rounded border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] shadow-xs transition hover:bg-slate-50 hover:shadow-sm dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-white/5 ${className}`}
    >
      <GoogleIcon className="h-5 w-5 shrink-0" />
      {children}
    </a>
  );
}

/** Nút "Continue with Facebook" đúng kiểu dáng chính thức (Meta Brand Resource Center). */
export function FacebookLoginButton({ href, children, className = "" }: SocialLoginButtonProps) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-10 items-center gap-2.5 rounded bg-[#1877F2] px-3 text-sm font-medium text-white transition hover:bg-[#166FE5] ${className}`}
    >
      <FacebookIcon className="h-5 w-5 shrink-0" />
      {children}
    </a>
  );
}
