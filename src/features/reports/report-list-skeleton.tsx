import { Skeleton } from '@/components/ui/skeleton'

/** 日報一覧（SC-02）の一覧部分を読み込んでいる間の表示 */
export function ReportListSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="日報を読み込んでいます">
      <Skeleton className="h-4 w-16" />
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}
