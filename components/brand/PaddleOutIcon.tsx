/**
 * The Paddle Back Out mark — a board on the water. Forgiving, never punitive:
 * you wipe out, you paddle back out.
 *
 * Rendered from the file rather than inlined because it's multi-colour (Seafoam
 * board, Midnight outline, Gold stripe, Reef water) — it doesn't take
 * currentColor the way the single-colour nav glyphs do.
 */
export function PaddleOutIcon({
  size = 24,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** Only when it stands alone; omit when a visible label follows. */
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/icons/paddle_back_out.svg"
      alt={title ?? ""}
      width={size}
      height={size}
      className={className}
    />
  );
}

export default PaddleOutIcon;
