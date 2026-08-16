import { lazy, memo, Suspense, useState } from 'react'
import { Children, cloneElement, isValidElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { AnimatePresence, motion } from 'framer-motion'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import 'katex/dist/katex.min.css'

const MarkdownCodeBlock = lazy(() => import('./MarkdownCodeBlock').then(({ MarkdownCodeBlock }) => ({ default: MarkdownCodeBlock })))

interface MarkdownViewerProps {
  content: string
  theme?: 'dark' | 'light'
}

const escapeHtmlAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const expandGalleryBlocks = (value: string) => value.replace(/:::gallery\{([^}]*)\}\n([\s\S]*?)\n:::/g, (_match, options: string, body: string) => {
  const columns = options.match(/columns="(2|3|4|auto)"/)?.[1] || '3'
  const aspect = options.match(/aspect="(square|auto)"/)?.[1] || 'auto'
  const layout = options.match(/layout="(grid|masonry)"/)?.[1] || 'grid'
  const images = [...body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)]
  const markup = images.map(([, alt, src]) => `<figure class="blog-gallery-item"><img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" /></figure>`).join('')
  return `<div class="blog-gallery blog-gallery-columns-${columns} blog-gallery-aspect-${aspect} blog-gallery-layout-${layout}">${markup}</div>`
})

const escapeHtmlText = (value: string) => escapeHtmlAttribute(value).replace(/\n/g, '<br />')

// Keep raw HTML useful for authored article blocks while retaining the sanitizer's
// protection against scripts, event handlers, unsafe URLs, and dangerous tags.
const blogSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'style'],
  },
}

const expandComponentBlocks = (value: string) => value
  .replace(/:::notice\{tone="(info|warning|success|danger)"\}\n([\s\S]*?)\n:::/g, (_match, tone: string, body: string) => `<div class="blog-notice blog-notice-${tone}">${escapeHtmlText(body)}</div>`)
  .replace(/:::details\{title="([^"]*)"\}\n([\s\S]*?)\n:::/g, (_match, title: string, body: string) => `<details class="blog-details"><summary>${escapeHtmlText(title)}</summary><div>${escapeHtmlText(body)}</div></details>`)
  .replace(/:::columns\n([\s\S]*?)\n:::/g, (_match, body: string) => {
    const [left, right] = body.split(/\n---\n/)
    return `<div class="blog-columns"><div>${escapeHtmlText(left || '')}</div><div>${escapeHtmlText(right || '')}</div></div>`
  })

type CalloutDefinition = {
  label: string
  icon: string
  dark: string
  light: string
  darkTitle: string
  lightTitle: string
}

const CALLOUT_DEFINITIONS: Record<string, CalloutDefinition> = {
  note: {
    label: 'Note', icon: '✎',
    dark: 'border-sky-400/70 bg-sky-400/10', light: 'border-sky-500 bg-sky-50',
    darkTitle: 'text-sky-300', lightTitle: 'text-sky-700',
  },
  abstract: {
    label: 'Abstract', icon: '✦',
    dark: 'border-cyan-400/70 bg-cyan-400/10', light: 'border-cyan-500 bg-cyan-50',
    darkTitle: 'text-cyan-300', lightTitle: 'text-cyan-700',
  },
  info: {
    label: 'Info', icon: 'ⓘ',
    dark: 'border-blue-400/70 bg-blue-400/10', light: 'border-blue-500 bg-blue-50',
    darkTitle: 'text-blue-300', lightTitle: 'text-blue-700',
  },
  todo: {
    label: 'Todo', icon: '☐',
    dark: 'border-blue-400/70 bg-blue-400/10', light: 'border-blue-500 bg-blue-50',
    darkTitle: 'text-blue-300', lightTitle: 'text-blue-700',
  },
  tip: {
    label: 'Tip', icon: '💡',
    dark: 'border-emerald-400/70 bg-emerald-400/10', light: 'border-emerald-500 bg-emerald-50',
    darkTitle: 'text-emerald-300', lightTitle: 'text-emerald-700',
  },
  success: {
    label: 'Success', icon: '✓',
    dark: 'border-green-400/70 bg-green-400/10', light: 'border-green-500 bg-green-50',
    darkTitle: 'text-green-300', lightTitle: 'text-green-700',
  },
  question: {
    label: 'Question', icon: '?',
    dark: 'border-violet-400/70 bg-violet-400/10', light: 'border-violet-500 bg-violet-50',
    darkTitle: 'text-violet-300', lightTitle: 'text-violet-700',
  },
  warning: {
    label: 'Warning', icon: '⚠',
    dark: 'border-amber-400/70 bg-amber-400/10', light: 'border-amber-500 bg-amber-50',
    darkTitle: 'text-amber-300', lightTitle: 'text-amber-700',
  },
  failure: {
    label: 'Failure', icon: '✕',
    dark: 'border-red-400/70 bg-red-400/10', light: 'border-red-500 bg-red-50',
    darkTitle: 'text-red-300', lightTitle: 'text-red-700',
  },
  danger: {
    label: 'Danger', icon: '⚡',
    dark: 'border-red-500/70 bg-red-500/10', light: 'border-red-600 bg-red-50',
    darkTitle: 'text-red-300', lightTitle: 'text-red-700',
  },
  bug: {
    label: 'Bug', icon: '♧',
    dark: 'border-rose-400/70 bg-rose-400/10', light: 'border-rose-500 bg-rose-50',
    darkTitle: 'text-rose-300', lightTitle: 'text-rose-700',
  },
  example: {
    label: 'Example', icon: '▣',
    dark: 'border-purple-400/70 bg-purple-400/10', light: 'border-purple-500 bg-purple-50',
    darkTitle: 'text-purple-300', lightTitle: 'text-purple-700',
  },
  quote: {
    label: 'Quote', icon: '❝',
    dark: 'border-slate-400/70 bg-slate-400/10', light: 'border-slate-500 bg-slate-50',
    darkTitle: 'text-slate-300', lightTitle: 'text-slate-700',
  },
}

const CALLOUT_ALIASES: Record<string, string> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
}

const getCalloutText = (value: ReactNode): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(getCalloutText).join('')
  if (isValidElement<{ children?: ReactNode }>(value)) {
    if (value.type === 'br') return '\n'
    return getCalloutText(value.props.children)
  }
  return ''
}

const calloutPattern = /^\s*\[!([^\]\s]+)\]([+-])?(?:[ \t]+([^\n]*))?/i

const getCalloutMatch = (value: ReactNode) => calloutPattern.exec(getCalloutText(value))

const removeCalloutHeader = (element: ReactNode, headerLength: number) => {
  if (!isValidElement<{ children?: ReactNode }>(element)) return null

  const children = Children.toArray(element.props.children)
  let headerRemoved = false
  let skipNextBreak = false
  const cleanedChildren: ReactNode[] = []

  for (const child of children) {
    if (!headerRemoved && typeof child === 'string') {
      headerRemoved = true
      const remainder = child.slice(headerLength).replace(/^\n/, '')
      if (remainder) cleanedChildren.push(remainder)
      else skipNextBreak = true
      continue
    }
    if (skipNextBreak && isValidElement<{ children?: ReactNode }>(child) && child.type === 'br') {
      skipNextBreak = false
      continue
    }
    cleanedChildren.push(child)
  }

  return cloneElement(element, undefined, cleanedChildren)
}

const CalloutHeader = ({ definition, title, className }: { definition: CalloutDefinition; title: string; className: string }) => (
  <span className={`flex items-center gap-2 font-semibold ${className}`}>
    <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">{definition.icon}</span>
    <span>{title}</span>
  </span>
)

const ObsidianCallout = ({ children, definition, title, fold, theme }: { children: ReactNode; definition: CalloutDefinition; title: string; fold?: '+' | '-'; theme: 'dark' | 'light' }) => {
  const borderAndBackground = theme === 'dark' ? definition.dark : definition.light
  const titleColor = theme === 'dark' ? definition.darkTitle : definition.lightTitle
  const bodyColor = theme === 'dark' ? 'text-white/85' : 'text-slate-700'
  const content = <div className={`mt-2 space-y-2 leading-7 ${bodyColor} [&>p]:my-0`}>{children}</div>

  if (fold) {
    return (
      <details open={fold === '+'} className={`my-4 rounded-2xl border-l-4 px-4 py-3 ${borderAndBackground}`}>
        <summary className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${titleColor}`}>
          <CalloutHeader definition={definition} title={title} className="inline-flex" />
        </summary>
        {content}
      </details>
    )
  }

  return (
    <div className={`my-4 rounded-2xl border-l-4 px-4 py-3 ${borderAndBackground}`}>
      <CalloutHeader definition={definition} title={title} className={titleColor} />
      {content}
    </div>
  )
}

export const MarkdownViewer = memo(function MarkdownViewer({ content, theme = 'dark' }: MarkdownViewerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  return (
    <>
      <div className={theme === 'dark' ? 'prose prose-invert max-w-none text-white prose-p:text-white prose-headings:text-white prose-strong:text-white prose-li:text-white prose-blockquote:text-white/85 prose-code:text-pink-200' : 'prose prose-slate max-w-none'}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, blogSanitizeSchema], rehypeKatex, rehypeSlug]}
          components={{
          div({ className, children, ...props }) {
            if (className?.includes('blog-gallery')) {
              return <div className={className} {...props}>{children}</div>
            }
            return <div className={className} {...props}>{children}</div>
          },
          h1({ children }) {
            return <h1 className={theme === 'dark' ? 'text-3xl font-bold text-white mt-6 mb-3' : 'text-3xl font-bold mt-6 mb-3'}>{children}</h1>
          },
          h2({ children }) {
            return <h2 className={theme === 'dark' ? 'text-2xl font-bold text-white mt-5 mb-3' : 'text-2xl font-bold mt-5 mb-3'}>{children}</h2>
          },
          h3({ children }) {
            return <h3 className={theme === 'dark' ? 'text-xl font-semibold text-white mt-4 mb-2' : 'text-xl font-semibold mt-4 mb-2'}>{children}</h3>
          },
          h4({ children }) {
            return <h4 className={theme === 'dark' ? 'text-lg font-semibold text-white mt-3 mb-2' : 'text-lg font-semibold mt-3 mb-2'}>{children}</h4>
          },
          h5({ children }) {
            return <h5 className={theme === 'dark' ? 'text-base font-semibold text-white mt-2 mb-1' : 'text-base font-semibold mt-2 mb-1'}>{children}</h5>
          },
          ul({ children }) {
            return <ul className="list-disc pl-6 my-3 space-y-1">{children}</ul>
          },
          ol({ children, start, ...props }) {
            return <ol start={start} className="list-decimal pl-6 my-3 space-y-1" {...props}>{children}</ol>
          },
          li({ children }) {
            return <li className={theme === 'dark' ? 'text-white/90 marker:text-white/70' : 'text-slate-800'}>{children}</li>
          },
          blockquote({ children }) {
            const blockquoteChildren = Children.toArray(children)
            const firstChild = blockquoteChildren[0]
            const calloutMatch = getCalloutMatch(firstChild)

            if (calloutMatch) {
              const rawType = calloutMatch[1].toLowerCase()
              const type = CALLOUT_ALIASES[rawType] || rawType
              const definition = CALLOUT_DEFINITIONS[type] || CALLOUT_DEFINITIONS.note
              const title = calloutMatch[3]?.trim() || definition.label
              const cleanedFirst = removeCalloutHeader(firstChild, calloutMatch[0].length)
              const firstBody = isValidElement<{ children?: ReactNode }>(cleanedFirst) ? getCalloutText(cleanedFirst.props.children).trim() : ''
              const bodyChildren = [
                ...(cleanedFirst && firstBody ? [cleanedFirst] : []),
                ...blockquoteChildren.slice(1),
              ]

              return (
                <ObsidianCallout definition={definition} title={title} fold={calloutMatch[2] as '+' | '-' | undefined} theme={theme}>
                  {bodyChildren}
                </ObsidianCallout>
              )
            }

            return (
              <blockquote className={theme === 'dark' ? 'my-4 border-l-4 border-sky-300/70 bg-white/5 px-4 py-3 rounded-r-xl text-white/90' : 'my-4 border-l-4 border-sky-500 bg-sky-50 px-4 py-3 rounded-r-xl text-slate-700'}>
                {children}
              </blockquote>
            )
          },
          // The code block component owns the complete surface. Avoid the
          // invalid default <pre><div> nesting and its browser margins.
          pre({ children }) {
            return <>{children}</>
          },
          code({ node, className, children, ...props }) {
            void node
            const text = String(children || '')
            const isInlineCode = !className && !text.includes('\n')
            if (!isInlineCode) {
              return (
                <Suspense fallback={<pre className="my-5 overflow-x-auto rounded-2xl bg-[#0b0f14] p-4 text-sm text-slate-200">{text}</pre>}>
                  <MarkdownCodeBlock className={className}>{children}</MarkdownCodeBlock>
                </Suspense>
              )
            }
            return (
              <code className={theme === 'dark' ? 'px-1.5 py-0.5 rounded-lg bg-white/10 text-pink-200' : 'px-1.5 py-0.5 rounded-lg bg-slate-200 text-rose-700'} {...props}>
                {children}
              </code>
            )
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className={theme === 'dark' ? 'w-full border-collapse border border-white/25 text-white/90' : 'w-full border-collapse border border-slate-300 text-slate-800'}>
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return <th className={theme === 'dark' ? 'border border-white/25 bg-white/10 px-3 py-2 text-left font-semibold' : 'border border-slate-300 bg-slate-100 px-3 py-2 text-left font-semibold'}>{children}</th>
          },
          td({ children }) {
            return <td className={theme === 'dark' ? 'border border-white/20 px-3 py-2 align-top' : 'border border-slate-300 px-3 py-2 align-top'}>{children}</td>
          },
          img({ src, alt, ...props }) {
            return (
              <figure className="my-6 blog-gallery-item">
                <img
                  src={src}
                  alt={alt}
                  className="rounded-3xl shadow-2xl max-w-full h-auto border-2 border-white/20 cursor-zoom-in"
                  loading="lazy"
                  onClick={() => {
                    if (src) setSelectedImage(src)
                  }}
                  {...props}
                />
                {alt && (
                  <p className={theme === 'dark' ? 'text-center text-white/50 text-sm mt-2 italic' : 'text-center text-slate-500 text-sm mt-2 italic'}>
                    {alt}
                  </p>
                )}
              </figure>
            )
          },
          a({ href, children, ...props }) {
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
          } satisfies Components}
        >
          {expandGalleryBlocks(expandComponentBlocks(content))}
        </ReactMarkdown>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm cursor-zoom-out"
              onClick={() => setSelectedImage(null)}
            >
              <motion.img
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                src={selectedImage}
                alt="Enlarged"
                className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImage(null)
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
})
