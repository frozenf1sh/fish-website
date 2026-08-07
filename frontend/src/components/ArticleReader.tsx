import type { ReactNode } from 'react'
import { MarkdownViewer } from './MarkdownViewer'
import type { BlogArticle } from '../shared/domain/content'

interface ArticleReaderProps {
  article: BlogArticle
  actions?: ReactNode
  className?: string
}

const formatDate = (value?: { toDate?: () => Date }) => {
  if (!value?.toDate) return '刚刚'
  return value.toDate().toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isUpdatedAfterCreated = (article: BlogArticle) => {
  const created = article.createdAt?.toDate?.()
  const updated = article.updatedAt?.toDate?.()
  return !!created && !!updated && updated.getTime() - created.getTime() > 1000
}

export function ArticleReader({ article, actions, className = '' }: ArticleReaderProps) {
  return (
    <article className={`bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-xl p-4 sm:p-8 ${className}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap pb-5 border-b border-slate-200">
        <div>
          <p className="text-sky-600 text-xs uppercase tracking-[0.2em] mb-2">Featured article</p>
          <h1 className="text-slate-900 text-2xl sm:text-4xl font-bold tracking-tight">{article.title}</h1>
          <p className="text-slate-500 text-sm mt-2">
            创建于 {formatDate(article.createdAt)}
            {isUpdatedAfterCreated(article) ? ` · 修改于 ${formatDate(article.updatedAt)}` : ''}
          </p>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <div className="mt-6 text-slate-900">
        <MarkdownViewer content={article.content} theme="light" />
      </div>
    </article>
  )
}
