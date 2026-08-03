import type { ReactNode } from "react";

/** Standard cream surface card used across the app. */
export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface-card shadow-card ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}

export default Card;
