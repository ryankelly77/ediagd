import {
  SkeletonScreen,
  SkeletonBlock,
  SkeletonEyebrow,
  SkeletonCard,
} from "@/components/brand/ScreenSkeleton";

/* Your Swell: eyebrow, the tall navy hero with the day count, two small cards
   side by side, then Paddle Back Out. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonEyebrow />

      <div className="mt-3 rounded-card bg-navy p-6 text-center shadow-card">
        <SkeletonBlock className="mx-auto h-[92px] w-[92px] rounded-full !bg-white/15" />
        <SkeletonBlock className="mx-auto mt-4 h-10 w-40 !bg-white/20" />
        <SkeletonBlock className="mx-auto mt-3 h-4 w-32 !bg-white/15" />
        <SkeletonBlock className="mt-6 h-12 w-full rounded-card !bg-white/10" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </div>

      <SkeletonCard className="mt-3" lines={4} />
    </SkeletonScreen>
  );
}
