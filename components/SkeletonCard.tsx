export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start gap-4">
        <div className="skeleton h-16 w-16 rounded-md" />
        <div className="flex-1">
          <div className="skeleton mb-2 h-2.5 w-16 rounded" />
          <div className="skeleton h-3 w-40 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  );
}
