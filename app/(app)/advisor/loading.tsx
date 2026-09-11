import {
  SkeletonScreen,
  SkeletonBlock,
  SkeletonEyebrow,
} from "@/components/brand/ScreenSkeleton";

/* The dashboard: greeting, the period stamp, the big labour-sales card with
   its three stats, then Eddie's Pick as a navy hero. Blocks land where those
   land so nothing jumps when the real numbers arrive. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonBlock className="h-8 w-48" />
      <SkeletonBlock className="mt-2 h-4 w-64" />
      <SkeletonBlock className="mt-3 h-4 w-72" />

      <div className="ediagd-card-feature mt-6 p-5">
        <SkeletonEyebrow />
        <SkeletonBlock className="mt-3 h-12 w-2/3" />
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <SkeletonBlock className="h-3 w-3/4" />
              <SkeletonBlock className="mt-2 h-5 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Eddie's Pick. Navy, so the blocks sit on white at low opacity. */}
      <div className="ediagd-hero mt-6">
        <SkeletonBlock className="h-3 w-40 !bg-white/20" />
        <SkeletonBlock className="mt-3 h-8 w-1/2 !bg-white/20" />
        <SkeletonBlock className="mt-3 h-4 w-full !bg-white/15" />
        <SkeletonBlock className="mt-2 h-2 w-full !bg-white/15" />
      </div>
    </SkeletonScreen>
  );
}
