import {
  SkeletonScreen,
  SkeletonBlock,
  SkeletonEyebrow,
  SkeletonRow,
} from "@/components/brand/ScreenSkeleton";

/* More: the account card, then a list of rows. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonEyebrow />

      <div className="ediagd-card mt-3 p-5">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="mt-2 h-3 w-56" />
        <SkeletonBlock className="mt-3 h-11 w-44 rounded-pill" />
        <SkeletonBlock className="mt-2 h-5 w-20 rounded-pill" />
      </div>

      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonScreen>
  );
}
