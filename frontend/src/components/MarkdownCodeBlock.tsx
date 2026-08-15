import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'
import graphql from 'react-syntax-highlighter/dist/esm/languages/prism/graphql'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

const languageModules = {
  javascript,
  typescript,
  jsx,
  tsx,
  bash,
  css,
  markup,
  json,
  markdown,
  yaml,
  sql,
  python,
  go,
  rust,
  java,
  c,
  cpp,
  diff,
  docker,
  graphql,
} as const

for (const [language, grammar] of Object.entries(languageModules)) {
  SyntaxHighlighter.registerLanguage(language, grammar)
}

SyntaxHighlighter.alias('javascript', ['js', 'mjs', 'cjs'])
SyntaxHighlighter.alias('typescript', ['ts'])
SyntaxHighlighter.alias('bash', ['sh', 'shell', 'zsh', 'console'])
SyntaxHighlighter.alias('markup', ['html', 'xml', 'svg'])
SyntaxHighlighter.alias('cpp', ['c++'])
SyntaxHighlighter.alias('markdown', ['md', 'mdx'])
SyntaxHighlighter.alias('yaml', ['yml'])
SyntaxHighlighter.alias('python', ['py'])
SyntaxHighlighter.alias('docker', ['dockerfile'])

const LANGUAGE_ALIASES: Record<string, keyof typeof languageModules | 'text'> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  'c++': 'cpp',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  py: 'python',
  dockerfile: 'docker',
  plaintext: 'text',
  plain: 'text',
  text: 'text',
}

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  bash: 'Shell',
  markup: 'HTML/XML',
  json: 'JSON',
  markdown: 'Markdown',
  yaml: 'YAML',
  sql: 'SQL',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  css: 'CSS',
  diff: 'Diff',
  docker: 'Dockerfile',
  graphql: 'GraphQL',
  text: '纯文本',
}

const supportedLanguages = new Set(Object.keys(languageModules))

const normalizeLanguage = (value: string | undefined) => {
  const raw = value?.trim().toLowerCase().split(/[\s:{]/, 1)[0] || 'text'
  const language = LANGUAGE_ALIASES[raw] || raw
  return supportedLanguages.has(language) ? language : 'text'
}

const toCodeText = (children: ReactNode) => {
  if (Array.isArray(children)) return children.join('')
  return String(children ?? '')
}

// oneDark includes small token backgrounds for a few Prism tokens.
// They look like white rectangles when the code surface is intentionally black,
// so keep the palette but remove token-level backgrounds.
const darkCodeTheme = Object.fromEntries(
  Object.entries(oneDark).map(([selector, styles]) => {
    const withoutBackground = Object.fromEntries(
      Object.entries(styles).filter(([property]) => property !== 'backgroundColor'),
    )
    return [selector, withoutBackground]
  }),
)

interface MarkdownCodeBlockProps {
  children: ReactNode
  className?: string
}

export function MarkdownCodeBlock({ children, className }: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const text = toCodeText(children).replace(/\n$/, '')
  const rawLanguage = /language-([^\s]+)/.exec(className || '')?.[1]
  const language = normalizeLanguage(rawLanguage)
  const languageLabel = LANGUAGE_LABELS[language] || rawLanguage || '纯文本'

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
  }, [])

  const showCopyResult = (failed: boolean) => {
    setCopyFailed(failed)
    setCopied(!failed)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      setCopied(false)
      setCopyFailed(false)
    }, 1600)
  }

  const copyWithFallback = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copiedByFallback = document.execCommand('copy')
    textarea.remove()
    if (!copiedByFallback) throw new Error('Clipboard copy failed')
  }

  const handleCopy = async () => {
    try {
      await copyWithFallback()
      showCopyResult(false)
    } catch {
      showCopyResult(true)
    }
  }

  return (
    <section className="my-5 overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0b0f14] shadow-xl shadow-slate-950/20" aria-label={`${languageLabel} 代码块`}>
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-400 sm:px-4">
        <span className="font-mono font-medium uppercase tracking-[0.12em]" title={rawLanguage || 'text'}>{languageLabel}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 font-medium text-slate-300 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-white"
          aria-label={copied ? '代码已复制' : '复制代码'}
        >
          {copied ? '已复制' : copyFailed ? '复制失败' : '复制代码'}
        </button>
      </header>

      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={language}
          style={darkCodeTheme}
          showLineNumbers
          wrapLines
          wrapLongLines={false}
          lineProps={{ style: { display: 'block', minHeight: '1.7em' } }}
          lineNumberStyle={{
            minWidth: '2.75em',
            marginRight: '1.25em',
            color: '#64748b',
            textAlign: 'right',
            userSelect: 'none',
          }}
          codeTagProps={{
            style: {
              display: 'block',
              minWidth: 'max-content',
              background: 'transparent',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            },
          }}
          customStyle={{
            margin: 0,
            minWidth: 'max-content',
            padding: '1rem 1.25rem 1.1rem 0.75rem',
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: 1.7,
          }}
        >
          {text}
        </SyntaxHighlighter>
      </div>
    </section>
  )
}
