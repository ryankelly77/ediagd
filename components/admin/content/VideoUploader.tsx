"use client";

/* ============================================================================
   EDIAGD — drag a video in, tag it, done

   The screen that ends manual asset ids. Drop a file, fill in where it belongs,
   and the pipeline does the rest: Mux transcodes with signed playback, captions
   and normalised audio already set, and the webhook creates the content row
   tagged the way it was tagged here.

   ---------------------------------------------------------------------------
   TAG FIRST, UPLOAD SECOND
   ---------------------------------------------------------------------------
   The form is above the drop zone on purpose. Tagging after the upload means
   seven hundred videos land untagged whenever somebody is interrupted, and
   untagged video is invisible video. Requiring a title before the drop zone
   activates costs three seconds and prevents that entirely.

   ---------------------------------------------------------------------------
   THE FILE GOES TO MUX, NOT THROUGH US
   ---------------------------------------------------------------------------
   The browser PUTs straight to the one-time URL. A 400MB video never touches a
   Next server function, which has neither the body limit nor the timeout for
   it.
   ============================================================================ */

import { useCallback, useRef, useState } from "react";
import { startUpload } from "@/app/(app)/admin/content/upload/actions";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

const PLACEMENTS = [
  { value: "", label: "Library only" },
  { value: "daily_lifestyle", label: "Daily loop — lifestyle slot" },
  { value: "daily_pitch", label: "Daily loop — service pitch" },
  { value: "onboarding_intro", label: "Onboarding — intro" },
] as const;

const TYPES = [
  { value: "advisor_video", label: "Advisor video" },
  { value: "manager_video", label: "Manager video" },
  { value: "joe_the_pro", label: "Joe the Pro (technician)" },
] as const;

export function VideoUploader({ families }: { families: string[] }) {
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState("");
  const [placement, setPlacement] = useState("");
  const [family, setFamily] = useState("");
  const [type, setType] = useState<string>("advisor_video");

  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const ready = title.trim().length > 0 && phase !== "uploading";

  const send = useCallback(
    async (file: File) => {
      setPhase("uploading");
      setPct(0);
      setMessage(null);

      const started = await startUpload(
        {
          title: title.trim(),
          collection: collection.trim() || null,
          placement: (placement || null) as never,
          service_family: family || null,
          type: type as never,
        },
        window.location.origin
      );

      if (!started.ok) {
        setPhase("error");
        setMessage(started.error);
        return;
      }
      const putUrl = started.url;
      if (!putUrl) {
        setPhase("error");
        setMessage("Mux returned no upload URL.");
        return;
      }

      /* XHR rather than fetch: this is the one place a real progress bar is
         worth it, and fetch still cannot report upload progress. */
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", putUrl, true);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setPhase("processing");
            setMessage(
              "Uploaded. Mux is transcoding and writing captions — the video " +
                "appears in the library as a draft when it's ready, usually a " +
                "few minutes. You can close this."
            );
          } else {
            setPhase("error");
            setMessage(`Upload failed (HTTP ${xhr.status}).`);
          }
          resolve();
        };
        xhr.onerror = () => {
          setPhase("error");
          setMessage("Upload failed — check the connection and try again.");
          resolve();
        };
        xhr.send(file);
      });
    },
    [title, collection, placement, family, type]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!ready) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void send(file);
    },
    [ready, send]
  );

  return (
    <div className="mt-4 space-y-4">
      {/* ---- tagging, first ------------------------------------------- */}
      <div className="ediagd-card space-y-3 p-5">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Warren Buffett Quote"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Series">
            <input
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              placeholder="Buffett Series"
              className={inputClass}
            />
          </Field>
          <Field label="Where it plays">
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              className={inputClass}
            >
              {PLACEMENTS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Audience">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Service family">
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {families.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
        </div>

        <p className="text-xs leading-relaxed text-ink-soft">
          Signed playback, English captions and normalised audio are set for
          every upload — there is nothing to tick in the Mux dashboard.
        </p>
      </div>

      {/* ---- the drop zone -------------------------------------------- */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (ready) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-card border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-teal bg-teal-soft/20" : "border-line bg-surface-card"
        } ${ready ? "" : "opacity-60"}`}
      >
        {phase === "uploading" ? (
          <>
            <p className="text-base font-extrabold text-navy">Uploading… {pct}%</p>
            <div
              className="mx-auto mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-pill"
              style={{ background: "rgb(var(--ediagd-teal-soft) / 0.45)" }}
            >
              <div
                className="h-full rounded-pill transition-[width]"
                style={{ width: `${pct}%`, background: "rgb(var(--ediagd-teal))" }}
              />
            </div>
          </>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-teal-soft/40 text-2xl text-ocean"
            >
              ↑
            </div>
            <p className="mt-3 text-base font-extrabold text-navy">
              {ready ? "Drop a video here" : "Give it a title first"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {ready ? "or" : "then drag a file in, or"}{" "}
              <button
                type="button"
                disabled={!ready}
                onClick={() => fileInput.current?.click()}
                className="font-bold text-ocean underline disabled:no-underline disabled:opacity-60"
              >
                choose a file
              </button>
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void send(f);
              }}
            />
          </>
        )}
      </div>

      {message && (
        <div
          className={`rounded-card border p-4 text-sm leading-relaxed ${
            phase === "error"
              ? "border-clay/40 bg-clay/10 text-clay"
              : "border-line bg-surface-card text-ink-soft"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
