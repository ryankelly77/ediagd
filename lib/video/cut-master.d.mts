/** Types for the one cutter. The implementation is cut-master.mjs, which is
 *  plain ESM so scripts/sync-repair.mjs can import it directly; this file is
 *  what lets the TypeScript callers see it. */

export type CutRequest = {
  /** Absolute path to the disk master. Never a Mux URL. */
  master: string;
  /** Seconds into the master where the content begins. */
  start: number;
  /** Seconds of content to keep. */
  duration: number;
  /** Where to write. Its basename becomes the uploaded file's name. */
  out: string;
};

export type MuxFetch = (path: string, init?: Record<string, unknown>) => Promise<any>;

export type UploadResult = {
  assetId: string | null;
  playbackId: string | null;
  asset: { duration?: number | string; status?: string; playback_ids?: { id: string }[] } | null;
  /** Null on success; the reason the upload did not produce a ready asset otherwise. */
  why: string | null;
};

export function findMaster(root: string | undefined, names: (string | null | undefined)[]): string | null;

export function cutFromMaster(o: CutRequest): string;

export function uploadAsNewAsset(o: {
  file: string;
  passthrough: string;
  mux: MuxFetch;
  say?: (s: string) => void;
}): Promise<UploadResult>;

export function cutAndUpload(
  o: CutRequest & { passthrough: string; mux: MuxFetch; say?: (s: string) => void }
): Promise<UploadResult & { cutPath: string }>;
