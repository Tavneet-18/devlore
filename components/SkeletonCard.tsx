export function SkeletonCard() {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-line bg-surface/60">
      <div className="skeleton hidden w-[168px] shrink-0 sm:block" />
      <div className="flex-1 p-5">
        <div className="skeleton mb-3 h-2.5 w-24 rounded" />
        <div className="skeleton mb-2 h-5 w-4/5 rounded" />
        <div className="skeleton mb-1.5 h-3 w-full rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="mt-4 flex items-center gap-3">
          <div className="skeleton h-2.5 w-28 rounded" />
          <div className="skeleton h-2.5 w-20 rounded" />
        </div>
      </div>
    </div>
  );
}
