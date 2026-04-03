import { useCallback, useState } from 'react'
import { PostComposer } from '../components/PostComposer'
import { Timeline } from '../components/Timeline'
import { useStore } from '../store/useStore'

export function HomePage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const [timelineKey, setTimelineKey] = useState(0)

  const handlePostCreated = useCallback(() => {
    setTimelineKey((prev) => prev + 1)
  }, [])

  return (
    <>
      {isLoggedIn && <PostComposer onPostCreated={handlePostCreated} />}
      <Timeline key={timelineKey} />
    </>
  )
}
