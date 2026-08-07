"use client";

import { useState } from "react";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";

/* ============================================================================
   EDIAGD — product shot, or a clean branded placeholder

   The placeholder covers BOTH cases: no image path set, and a path whose file
   isn't there (the catalog is seeded with paths before the photography exists).
   onError flips to it, so a missing file never shows a browser's broken-image
   icon — advisor-facing or admin-facing.

   Takes a raw src rather than a SwagItem so the admin editor can preview a path
   as it's being typed, before anything is saved.
   ============================================================================ */

export type SwagImageVariant =
  /** Grid tile — crops to a tidy square. */
  | "tile"
  /** Detail sheet — the WHOLE product, letterboxed, nothing cut off. */
  | "detail"
  /** Admin list row. */
  | "thumb"
  /** Admin editor — big enough to spot a wrong photo. */
  | "preview";

export function SwagImage({
  src,
  variant = "tile",
  onStatus,
}: {
  src: string | null;
  variant?: SwagImageVariant;
  /** Fires when the path resolves or fails — drives the admin's hint. */
  onStatus?: (status: "ok" | "missing") => void;
}) {
  // Which src failed, rather than a bare boolean: a new path then gets a fresh
  // verdict automatically, with no reset effect. Setting state inside an effect
  // to clear a flag causes cascading renders — this derives it instead.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && failedSrc === src;

  // Status is reported from the load events only. The "empty" case belongs to
  // the caller, which knows whether it has a path at all.
  const handleError = () => {
    setFailedSrc(src);
    onStatus?.("missing");
  };
  const handleLoad = () => onStatus?.("ok");

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center bg-teal-soft/25 ${
          PLACEHOLDER_BOX[variant]
        }`}
      >
        <SandDollarIcon size={PLACEHOLDER_ICON[variant]} tone="sand" />
      </span>
    );
  }

  if (variant === "detail") {
    return (
      <span className="flex max-h-[46vh] w-full items-center justify-center bg-teal-soft/15 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onError={handleError}
          onLoad={handleLoad}
          className="max-h-[40vh] w-auto max-w-full object-contain"
        />
      </span>
    );
  }

  if (variant === "preview") {
    return (
      <span className="flex h-[200px] w-full items-center justify-center overflow-hidden rounded-card border border-line bg-teal-soft/15 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onError={handleError}
          onLoad={handleLoad}
          className="max-h-full w-auto max-w-full object-contain"
        />
      </span>
    );
  }

  if (variant === "thumb") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={handleError}
        onLoad={handleLoad}
        className="h-14 w-14 shrink-0 rounded-card border border-line object-cover"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={handleError}
      onLoad={handleLoad}
      className="aspect-square w-full object-cover"
    />
  );
}

const PLACEHOLDER_BOX: Record<SwagImageVariant, string> = {
  tile: "aspect-square w-full",
  detail: "h-48 w-full",
  thumb: "h-14 w-14 shrink-0 rounded-card border border-line",
  preview: "h-[200px] w-full rounded-card border border-line",
};

const PLACEHOLDER_ICON: Record<SwagImageVariant, number> = {
  tile: 34,
  detail: 56,
  thumb: 20,
  preview: 48,
};

export default SwagImage;
