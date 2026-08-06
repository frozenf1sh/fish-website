import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled page error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section className="glass-card rounded-3xl p-8 m-4 text-center text-white">
        <div className="text-4xl mb-3" aria-hidden="true">🐟</div>
        <h1 className="text-xl font-semibold">这个页面暂时出了点问题</h1>
        <p className="text-white/65 text-sm mt-2">可以先刷新页面重试，已保存的数据不会因此丢失。</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary mt-5 rounded-2xl px-5 py-2.5"
        >
          刷新页面
        </button>
      </section>
    )
  }
}
