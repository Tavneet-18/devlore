export function SkeletonCard() {
  return (
    <div className="grid grid-cols-[2.25rem_96px_minmax(0,1fr)_auto] items-center gap-5 border-t border-line py-6">
      <div className="skeleton h-3 w-5 rounded" />
      <div className="skeleton h-24 w-24 rounded-md" />
      <div className="space-y-2">
        <div className="skeleton h-2.5 w-16 rounded" />
        <div className="skeleton h-5 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
      <div className="hidden space-y-1.5 sm:block">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  );
}
