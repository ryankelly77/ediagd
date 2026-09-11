import {
  SkeletonScreen,
  SkeletonBlock,
  SkeletonCard,
} from "@/components/brand/ScreenSkeleton";

/* The team view: store name, period stamp, then the roster. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonBlock className="h-8 w-64" />
      <SkeletonBlock className="mt-2 h-4 w-48" />
      <SkeletonCard className="mt-4" lines={2} />
      <div className="mt-3 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="ediagd-card flex items-center gap-3 p-4">
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-1/3" />
              <SkeletonBlock className="mt-2 h-3 w-1/2" />
            </div>
            <SkeletonBlock className="h-5 w-12 rounded-pill" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
