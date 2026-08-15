import { useEffect, useMemo, useState } from 'react'
import { clients } from '../lib/connect'
import type { GitHubActivity } from '../shared/domain/content'

const formatCount = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
type TimelinePost = Awaited<ReturnType<typeof clients.post.listPosts>>['posts'][number]
type ContributionDay = GitHubActivity['weeks'][number][number]

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

const getPostPreview = (content: string) => content
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/[`*_>#]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const getPostTime = (post: TimelinePost) => {
  const date = post.createdAt?.toDate?.()
  if (!date) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const getLastWeekDate = (week: GitHubActivity['weeks'][number]) => week[week.length - 1]?.date || ''

export function GitHubActivityCard() {
  const [activity, setActivity] = useState<GitHubActivity | null>(null)
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadPosts = async () => {
      const loadedPosts: TimelinePost[] = []
      let pageToken = ''

      for (let page = 0; page < 20; page += 1) {
        const response = await clients.post.listPosts({ pageSize: 100, pageToken })
        loadedPosts.push(...response.posts)
        if (!response.hasMore || !response.nextPageToken) break
        pageToken = response.nextPageToken
      }

      return loadedPosts
    }

    Promise.allSettled([clients.github.getActivity(), loadPosts()])
      .then(([activityResult, postsResult]) => {
        if (cancelled) return
        if (activityResult.status === 'fulfilled') {
          setActivity(activityResult.value as GitHubActivity | null)
        } else {
          console.error('Failed to load GitHub activity:', activityResult.reason)
        }
        if (postsResult.status === 'fulfilled') {
          setPosts(postsResult.value)
        } else {
          console.error('Failed to load timeline posts for calendar:', postsResult.reason)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const orderedWeeks = useMemo(
    () => [...(activity?.weeks || [])].sort((left, right) => getLastWeekDate(left).localeCompare(getLastWeekDate(right))),
    [activity],
  )
  const postsByDate = useMemo(() => {
    const grouped = new Map<string, TimelinePost[]>()
    for (const post of posts) {
      const date = post.createdAt?.toDate?.()
      if (!date) continue
      const key = toDateKey(date)
      grouped.set(key, [...(grouped.get(key) || []), post])
    }
    return grouped
  }, [posts])

  if (isLoading) {
    return <section className="rounded-3xl bg-white p-4 sm:p-6 shadow-xl animate-pulse" aria-label="正在加载 GitHub 活动" />
  }

  if (!activity) return null

  const recentWeeks = orderedWeeks.slice(-26)
  const selectedPosts = selectedDateKey ? postsByDate.get(selectedDateKey) || [] : []

  const renderDay = (day: ContributionDay) => {
    const dayPosts = postsByDate.get(day.date) || []
    const isSelected = selectedDateKey === day.date

    return (
      <button
        key={day.date}
        type="button"
        onClick={() => setSelectedDateKey(day.date)}
        title={`${day.date} · ${day.contributionCount} 次贡献${dayPosts.length > 0 ? ` · ${dayPosts.length} 条动态` : ''}`}
        aria-label={`${day.date}，${day.contributionCount} 次 GitHub 贡献${dayPosts.length > 0 ? `，${dayPosts.length} 条动态` : ''}`}
        className={`relative h-2.5 w-2.5 shrink-0 rounded-[3px] border-0 bg-transparent p-0 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${isSelected ? 'ring-2 ring-blue-600 ring-offset-1' : ''}`}
      >
        <span className="block h-full w-full rounded-[3px]" style={{ backgroundColor: day.color || '#ebedf0' }} />
        {dayPosts.length > 0 && <span aria-hidden="true" className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-fuchsia-600 ring-1 ring-white" />}
      </button>
    )
  }

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
          <div className="mt-3 flex justify-end overflow-hidden pb-2 sm:hidden" aria-label="GitHub 最近六个月贡献日历">
            <div className="flex w-max shrink-0 gap-0.5 px-1">
              {recentWeeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map(renderDay)}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 -mx-1 hidden overflow-x-auto pb-2 sm:block" tabIndex={0} aria-label="GitHub 最近一年贡献日历，可横向滚动">
            <div className="flex min-w-[620px] gap-0.5 px-1">
              {orderedWeeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map(renderDay)}
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

      {selectedDateKey && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-900">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">{formatDateLabel(selectedDateKey)} 的动态</h4>
            <button type="button" onClick={() => setSelectedDateKey(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="关闭日期动态">×</button>
          </div>
          {selectedPosts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {selectedPosts.map((post) => (
                <a key={post.id} href={`/post/${post.id}`} className="block rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 hover:bg-slate-100">
                  <p className="line-clamp-2 text-sm leading-5 text-slate-700">{getPostPreview(post.content) || '图片动态'}</p>
                  <p className="mt-1 text-xs text-slate-400">{getPostTime(post)}</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">这一天没有发布动态。</p>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
        <span>少</span><span className="h-2.5 w-2.5 rounded-[3px] bg-[#ebedf0]" /><span className="h-2.5 w-2.5 rounded-[3px] bg-[#9be9a8]" /><span className="h-2.5 w-2.5 rounded-[3px] bg-[#30a14e]" /><span>多</span>
        <span className="ml-1 inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-fuchsia-600" />动态</span>
      </div>
    </section>
  )
}
