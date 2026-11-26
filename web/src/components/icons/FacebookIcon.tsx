import type { SVGProps } from "react";

/** Logo Facebook (vòng tròn trắng + chữ "f" xanh), dùng trên nền xanh #1877F2 của nút "Continue with Facebook". */
export function FacebookIcon({
  className = "h-5 w-5",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" {...props}>
      <circle cx="24" cy="24" r="24" fill="#fff" />
      <path
        fill="#1877F2"
        d="M32.96 30.87l1.1-7.17H27.2v-4.66c0-1.96.96-3.87 4.04-3.87h3.13V8.9s-2.84-.48-5.55-.48c-5.66 0-9.36 3.43-9.36 9.64v5.46h-6.3v7.17h6.3V48h7.74V30.87z"
      />
    </svg>
  );
}
