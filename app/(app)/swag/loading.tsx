import {
  SkeletonScreen,
  SkeletonBlock,
  SkeletonEyebrow,
  SkeletonCard,
} from "@/components/brand/ScreenSkeleton";

/* The Swag Shack: balance, then the gear. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonEyebrow />
      <SkeletonBlock className="mt-2 h-7 w-44" />
      <SkeletonCard className="mt-3" lines={2} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ediagd-card p-4">
            <SkeletonBlock className="h-24 w-full rounded-card" />
            <SkeletonBlock className="mt-3 h-4 w-3/4" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
