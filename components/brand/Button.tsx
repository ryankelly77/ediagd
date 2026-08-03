import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "navy" | "ghost";

/**
 * Primary = gold CTA on navy text (the "Watch the pitch" button).
 * Navy = solid navy. Ghost = quiet, for secondary actions.
 * Focus ring uses the brand gold for visible keyboard focus.
 */
export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-navy hover:brightness-95",
    navy: "bg-navy text-white hover:brightness-110",
    ghost: "bg-transparent text-ocean hover:bg-teal-soft/30",
  };
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[11px] px-4 py-2.5",
        "text-sm font-extrabold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
        styles[variant],
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
}

export default Button;
