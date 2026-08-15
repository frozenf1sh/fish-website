import { useState, type ReactNode } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownCodeBlockProps {
  children: ReactNode
  className?: string
  theme: 'dark' | 'light'
}

export function MarkdownCodeBlock({ children, className, theme }: MarkdownCodeBlockProps) {
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
