import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownViewerProps {
  content: string
  theme?: 'dark' | 'light'
}

function CodeBlock({ children, className, theme }: { children: React.ReactNode; className?: string; theme: 'dark' | 'light' }) {
  const [copied, setCopied] = useState(false)
  const text = String(children || '').replace(/\n$/, '')
  const match = /language-(\w+)/.exec(className || '')
  const language = match?.[1] || 'text'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={`my-4 rounded-3xl overflow-hidden ${theme === 'dark' ? 'bg-black/40 backdrop-blur-sm border border-white/10' : 'bg-slate-100 border border-slate-300'}`}>
      <div className={`flex justify-end px-3 py-2 ${theme === 'dark' ? 'border-b border-white/10' : 'border-b border-slate-300'}`}>
        <button
          type="button"
          onClick={handleCopy}
          className={`text-xs px-2 py-1 rounded-lg transition-all ${theme === 'dark' ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
        >
          {copied ? '已复制' : '复制代码'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={theme === 'dark' ? oneDark : oneLight}
        customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '0.85rem' }}
        wrapLongLines
      >
        {text}
      </SyntaxHighlighter>
    </div>
  )
}

export const MarkdownViewer = memo(function MarkdownViewer({ content, theme = 'dark' }: MarkdownViewerProps) {
  return (
    <div className={theme === 'dark' ? 'prose prose-invert max-w-none text-white prose-p:text-white prose-headings:text-white prose-strong:text-white prose-li:text-white prose-blockquote:text-white/85 prose-code:text-pink-200' : 'prose prose-slate max-w-none'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            if (!inline) {
              return <CodeBlock theme={theme} className={className}>{children}</CodeBlock>
            }
            return (
              <code className={theme === 'dark' ? 'px-1.5 py-0.5 rounded-lg bg-white/10 text-pink-200' : 'px-1.5 py-0.5 rounded-lg bg-slate-200 text-rose-700'} {...props}>
                {children}
              </code>
            )
          },
          table({ children }: any) {
            return <div className="overflow-x-auto my-4"><table>{children}</table></div>
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
                  <p className={theme === 'dark' ? 'text-center text-white/50 text-sm mt-2 italic' : 'text-center text-slate-500 text-sm mt-2 italic'}>
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
                className={theme === 'dark' ? 'text-blue-300 hover:text-blue-200 underline' : 'text-blue-700 hover:text-blue-600 underline'}
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
