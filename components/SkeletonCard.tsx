export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-card p-5 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-6 w-28 rounded-full" />
        <div className="skeleton h-9 w-9 rounded-full" />
      </div>
      <div className="skeleton mb-2 h-5 w-3/4 rounded-md" />
      <div className="skeleton mb-1 h-4 w-full rounded-md" />
      <div className="skeleton mb-4 h-4 w-2/3 rounded-md" />
      <div className="skeleton mb-4 h-4 w-40 rounded-md" />
      <div className="flex gap-1.5">
        <div className="skeleton h-5 w-16 rounded-md" />
        <div className="skeleton h-5 w-20 rounded-md" />
        <div className="skeleton h-5 w-14 rounded-md" />
      </div>
      <div className="mt-4 border-t border-white/5 pt-4">
        <div className="skeleton h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}
