/** Race a request against a timeout and always release the timer. */
export function withTimeout<T>(request: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  })
}
