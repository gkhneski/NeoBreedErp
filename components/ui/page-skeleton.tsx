function Block({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-secondary ${className ?? ""}`}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Sayfa yükleniyor">
      <div className="space-y-2">
        <Block className="h-8 w-64" />
        <Block className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <Block className="h-9 w-full rounded-none" />
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3">
              <Block className="h-4 w-28" />
              <Block className="h-4 flex-1" />
              <Block className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
