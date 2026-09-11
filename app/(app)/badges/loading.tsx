import {
  SkeletonScreen,
  SkeletonBlock,
  SkeletonEyebrow,
} from "@/components/brand/ScreenSkeleton";

/* The wall: eyebrow, the earned count, then families of round badges. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonEyebrow />
      <SkeletonBlock className="mt-2 h-7 w-56" />
      <SkeletonBlock className="mt-2 h-3 w-72" />

      {[0, 1].map((family) => (
        <div key={family} className="mt-8">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="mt-2 h-3 w-64" />
          <div className="mt-4 grid grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center">
                <SkeletonBlock className="h-20 w-20 rounded-full" />
                <SkeletonBlock className="mt-2 h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}
