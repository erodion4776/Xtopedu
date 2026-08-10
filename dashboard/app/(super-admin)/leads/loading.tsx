import { Skeleton } from '@/components/ui/skeleton';

export default function LeadsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-8" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-7 w-20 rounded-full"
          />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 rounded-xl"
          />
        ))}
      </div>
    </div>
  );
}
