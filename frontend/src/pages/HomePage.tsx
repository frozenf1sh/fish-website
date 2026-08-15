import { lazy, Suspense, useCallback, useState } from 'react'
import { Timeline } from '../components/Timeline'
import { useStore } from '../store/useStore'

const PostComposer = lazy(() => import('../components/PostComposer').then(({ PostComposer }) => ({ default: PostComposer })))

export function HomePage() {
  const isLoggedIn = useStore((state) => state.isLoggedIn)
  const [timelineKey, setTimelineKey] = useState(0)

  const handlePostCreated = useCallback(() => {
    setTimelineKey((prev) => prev + 1)
  }, [])

  return (
    <>
      {isLoggedIn && (
        <Suspense fallback={null}>
          <PostComposer onPostCreated={handlePostCreated} />
        </Suspense>
      )}
      <Timeline key={timelineKey} />
    </>
  )
}
