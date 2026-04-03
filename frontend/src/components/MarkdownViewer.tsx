import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownViewerProps {
  content: string
}

export const MarkdownViewer = memo(function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            if (!inline) {
              return (
                <div className="my-4 p-4 rounded-3xl bg-black/40 backdrop-blur-sm border border-white/10 overflow-auto">
                  <pre className="text-white/90 text-sm">{children}</pre>
                </div>
              )
            }
            return (
              <code className="px-1.5 py-0.5 rounded-lg bg-white/10 text-pink-200" {...props}>
                {children}
              </code>
            )
          },
          img({ src, alt, ...props }: any) {
            return (
              <div className="my-6">
                <img
                  src={src}
                  alt={alt}
                  className="rounded-3xl shadow-2xl max-w-full h-auto border-2 border-white/20"
                  loading="lazy"
                  {...props}
                />
                {alt && (
                  <p className="text-center text-white/50 text-sm mt-2 italic">
                    {alt}
                  </p>
                )}
              </div>
            )
          },
          a({ href, children, ...props }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-blue-200 underline"
                {...props}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
