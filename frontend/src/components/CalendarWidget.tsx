import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'

export function CalendarWidget() {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [schedules] = useState<Record<string, any[]>>({})

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

  const selectedSchedules = schedules[selectedDateKey] || []

  const hasSchedule = (date: number) => {
    const y = currentYear
    const m = String(currentMonth + 1).padStart(2, '0')
    const d = String(date).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    return schedules[key] && schedules[key].length > 0
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
                onClick={() => setSelectedDate(new Date(currentYear, currentMonth, date))}
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
                {hasSchedule(date) && !isSelected(date) && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-pink-400 to-rose-400"></span>
                )}
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      {/* 选中日期的日程 */}
      {selectedSchedules.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-4xl p-6"
        >
          <h3 className="text-white/90 font-semibold mb-4 flex items-center gap-2">
            <span className="text-lg">📋</span>
            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 日程
          </h3>
          <div className="space-y-3">
            {selectedSchedules.map((schedule: any) => (
              <motion.div
                key={schedule.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.02, x: 4 }}
                className={`p-4 rounded-2xl bg-gradient-to-r ${schedule.color} bg-opacity-20 border border-white/10`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{schedule.icon}</span>
                  <div className="flex-1">
                    <h4 className="text-white font-medium">{schedule.title}</h4>
                    <p className="text-white/70 text-sm mt-1">{schedule.time}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 添加日程按钮 */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-3xl bg-gradient-to-r from-blue-400/30 to-purple-400/30 text-white/90 hover:text-white hover:from-blue-400/40 hover:to-purple-400/40 transition-all border border-white/20"
      >
        <span className="text-xl">➕</span>
        <span className="font-medium">添加日程</span>
      </motion.button>
    </div>
  )
}
