export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastPayload {
  message: string
  type?: ToastType
}

export function showToast(payload: ToastPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ToastPayload>('app:toast', { detail: payload }))
}
