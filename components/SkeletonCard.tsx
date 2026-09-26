export function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface/70 p-5">
      <div className="absolute bottom-0 left-0 top-0 w-[3px] bg-line" aria-hidden />
      <div className="flex items-start gap-3.5">
        <div className="skeleton h-16 w-16 rounded-lg" />
        <div className="flex-1">
          <div className="skeleton mb-2 h-2.5 w-16 rounded" />
          <div className="skeleton h-3 w-32 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  );
}
