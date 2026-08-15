import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { clients } from '../lib/connect'

type TimelinePost = Awaited<ReturnType<typeof clients.post.listPosts>>['posts'][number]

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPostPreview = (content: string) => content
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/[`*_>#]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const getPostTime = (post: TimelinePost) => {
  const date = post.createdAt?.toDate?.()
  return date ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
}

export function CalendarWidget() {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [isDateDetailsOpen, setIsDateDetailsOpen] = useState(false)
  const [posts, setPosts] = useState<TimelinePost[]>([])

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

      if (!cancelled) setPosts(loadedPosts)
    }

    loadPosts().catch((error) => console.error('Failed to load posts for calendar:', error))
    return () => { cancelled = true }
  }, [])

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

  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate()
  }, [currentMonth, currentYear])

  const firstDayOfMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).getDay()
  }, [currentMonth, currentYear])

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const selectedDateKey = useMemo(() => {
    const y = selectedDate.getFullYear()
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const d = String(selectedDate.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [selectedDate])

  const selectedPosts = postsByDate.get(selectedDateKey) || []

  const hasPost = (date: number) => {
    const y = currentYear
    const m = String(currentMonth + 1).padStart(2, '0')
    const d = String(date).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    return postsByDate.has(key)
  }

  const isToday = (date: number) => {
    return date === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
  }

  const isSelected = (date: number) => {
    return date === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear()
  }

  return (
    <div className="space-y-4">
      {/* 日历主体 */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="glass-card rounded-4xl p-6"
      >
        {/* 月份标题 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 rounded-2xl hover:bg-white/10 text-white/70 hover:text-white transition-all"
          >
            ◀
          </button>
          <h3 className="text-white/90 font-semibold text-lg">
            {currentYear}年 {monthNames[currentMonth]}
          </h3>
          <button
            onClick={nextMonth}
            className="p-2 rounded-2xl hover:bg-white/10 text-white/70 hover:text-white transition-all"
          >
            ▶
          </button>
        </div>

        {/* 星期 */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {weekDays.map((day, i) => (
            <span
              key={day}
              className={`text-sm font-medium py-2 ${
                i === 0 || i === 6 ? 'text-pink-300' : 'text-white/60'
              }`}
            >
              {day}
            </span>
          ))}
        </div>

        {/* 日期 */}
        <div className="grid grid-cols-7 gap-1">
          {/* 前一个月的空白 */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square"></div>
          ))}

          {/* 当月日期 */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const date = i + 1
            return (
              <motion.button
                key={date}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedDate(new Date(currentYear, currentMonth, date))
                  setIsDateDetailsOpen(true)
                }}
                className={`
                  aspect-square rounded-2xl flex items-center justify-center text-sm font-medium transition-all relative
                  ${isSelected(date)
                    ? 'bg-gradient-to-br from-blue-400 to-pink-400 text-white shadow-lg'
                    : isToday(date)
                    ? 'bg-white/30 text-white border-2 border-blue-400'
                    : 'text-white/80 hover:bg-white/10'
                  }
                `}
              >
                {date}
                {hasPost(date) && (
                  <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-pink-500"></span>
                )}
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      {/* 选中日期的动态 */}
      {isDateDetailsOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-4xl p-6"
        >
          <h3 className="text-white/90 font-semibold mb-4 flex items-center gap-2">
            <span className="text-lg">📝</span>
            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 动态
          </h3>
          {selectedPosts.length > 0 ? (
            <div className="space-y-3">
              {selectedPosts.map((post) => (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/10 p-4"
                >
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white/85">{getPostPreview(post.content) || '图片动态'}</p>
                  {getPostTime(post) && <p className="mt-2 text-xs text-white/45">发布于 {getPostTime(post)}</p>}
                </motion.article>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-white/55">这一天没有发布动态。</p>
          )}
        </motion.div>
      )}
    </div>
  )
}
