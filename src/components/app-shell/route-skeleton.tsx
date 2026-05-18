// Skeleton shells used by per-route `loading.tsx` files. Mirror each route's
// hero so the swap to the real content is visually quiet — no big layout shift.

import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--hairline-soft)]",
        className,
      )}
      aria-hidden
    />
  );
}

export function TodaySkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-3">
          <Bar className="h-6 w-48" />
          <Bar className="h-3 w-32" />
        </div>
        <Bar className="h-4 w-20" />
      </div>
      <div className="mt-10 max-w-3xl space-y-3">
        <Bar className="h-9 w-full" />
        <Bar className="h-9 w-4/5" />
        <Bar className="h-9 w-3/5" />
      </div>
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        <Bar className="h-48 md:col-span-2 md:row-span-2" />
        <Bar className="h-24" />
        <Bar className="h-24" />
        <Bar className="h-24 md:col-span-2" />
        <Bar className="h-24" />
      </div>
    </div>
  );
}

export function SheetSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32">
      <Bar className="h-8 w-72" />
      <div className="mt-6 flex gap-2">
        <Bar className="h-7 w-20" />
        <Bar className="h-7 w-20" />
        <Bar className="h-7 w-20" />
      </div>
      <div className="mt-8 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Bar key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export function PlansSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-32">
      <Bar className="h-9 w-64" />
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-36" />
        ))}
      </div>
    </div>
  );
}

export function PlanDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-32">
      <Bar className="h-3 w-20" />
      <Bar className="mt-3 h-10 w-3/4" />
      <Bar className="mt-3 h-4 w-2/5" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <div className="hidden w-64 shrink-0 border-r border-[var(--hairline-soft)] px-3 py-4 md:block">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Bar key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} className={cn("h-14", i % 2 === 0 ? "w-3/5" : "w-4/5")} />
          ))}
        </div>
      </div>
    </div>
  );
}
