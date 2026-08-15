import { useEffect, useState } from 'react'
import { clients } from '../lib/connect'
import type { GitHubActivity } from '../shared/domain/content'

const formatCount = (value: number) => new Intl.NumberFormat('zh-CN').format(value)

export function GitHubActivityCard() {
  const [activity, setActivity] = useState<GitHubActivity | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    clients.github.getActivity()
      .then((result) => {
        if (!cancelled) setActivity(result as GitHubActivity | null)
      })
      .catch((error) => console.error('Failed to load GitHub activity:', error))
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (isLoading) {
    return <section className="rounded-3xl bg-white p-4 sm:p-6 shadow-xl animate-pulse" aria-label="正在加载 GitHub 活动" />
  }

  if (!activity) return null

  const recentWeeks = activity.weeks.slice(-26)

  return (
    <section className="w-full overflow-hidden rounded-3xl bg-white p-4 text-slate-900 shadow-xl sm:p-5" aria-label="GitHub 活动">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img src={activity.avatarUrl} alt={`${activity.username} avatar`} className="h-11 w-11 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold sm:text-lg">{activity.displayName || activity.username}</p>
            <a href={activity.profileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-slate-500 hover:text-slate-900 hover:underline">@{activity.username}</a>
          </div>
        </div>
        <a href={activity.profileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-100 sm:text-sm">GitHub ↗</a>
      </div>

      {activity.bio && <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{activity.bio}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-200 py-2.5 text-center">
        <div><p className="text-base font-semibold sm:text-lg">{formatCount(activity.publicRepositories)}</p><p className="text-xs text-slate-500">公开仓库</p></div>
        <div><p className="text-base font-semibold sm:text-lg">{formatCount(activity.followers)}</p><p className="text-xs text-slate-500">关注者</p></div>
        <div><p className="text-base font-semibold sm:text-lg">{formatCount(activity.totalContributions)}</p><p className="text-xs text-slate-500">年度贡献</p></div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold sm:text-base">贡献日历</h3>
        <span className="text-xs text-slate-400"><span className="sm:hidden">最近六个月</span><span className="hidden sm:inline">最近一年</span></span>
      </div>

      {activity.contributionCalendarAvailable ? (
        <>
          <div className="mt-3 overflow-hidden pb-1 sm:hidden" aria-label="GitHub 最近六个月贡献日历">
            <div className="flex w-max gap-0.5 px-1">
              {recentWeeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-0.5">
                  {week.map((day) => (
                    <span key={day.date} title={`${day.date} · ${day.contributionCount} 次贡献`} className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/5" style={{ backgroundColor: day.color || '#ebedf0' }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 -mx-1 hidden overflow-x-auto pb-1 sm:block" tabIndex={0} aria-label="GitHub 最近一年贡献日历，可横向滚动">
            <div className="flex min-w-[620px] gap-0.5 px-1">
            {activity.weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-0.5">
                {week.map((day) => (
                  <span key={day.date} title={`${day.date} · ${day.contributionCount} 次贡献`} className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/5" style={{ backgroundColor: day.color || '#ebedf0' }} />
                ))}
              </div>
            ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-500">
          贡献日历暂未配置，前往 GitHub 查看完整活动。
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
        <span>少</span><span className="h-2.5 w-2.5 rounded-[3px] bg-[#ebedf0]" /><span className="h-2.5 w-2.5 rounded-[3px] bg-[#9be9a8]" /><span className="h-2.5 w-2.5 rounded-[3px] bg-[#30a14e]" /><span>多</span>
      </div>
    </section>
  )
}
