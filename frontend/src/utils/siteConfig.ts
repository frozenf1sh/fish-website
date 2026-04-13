export interface SiteBehaviorConfig {
  defaultTitle: string
  hiddenTitle: string
  focusTitle: string
  faviconUrl: string
  baseTextMode: 'white' | 'black'
}

const DEFAULT_CONFIG: SiteBehaviorConfig = {
  defaultTitle: '冻鱼的小站',
  hiddenTitle: '快回来看看！',
  focusTitle: '欢迎回来！',
  faviconUrl: '',
  baseTextMode: 'white',
}

const KEY_DEFAULT_TITLE = 'siteDefaultTitle'
const KEY_HIDDEN_TITLE = 'siteHiddenTitle'
const KEY_FOCUS_TITLE = 'siteFocusTitle'
const KEY_FAVICON_URL = 'siteFaviconUrl'
const KEY_BASE_TEXT_MODE = 'siteBaseTextMode'

function parseJSON(raw?: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export function readSiteBehaviorConfig(customLinks?: string): SiteBehaviorConfig {
  const parsed = parseJSON(customLinks)
  return {
    defaultTitle: typeof parsed[KEY_DEFAULT_TITLE] === 'string' && parsed[KEY_DEFAULT_TITLE].trim()
      ? String(parsed[KEY_DEFAULT_TITLE]).trim()
      : DEFAULT_CONFIG.defaultTitle,
    hiddenTitle: typeof parsed[KEY_HIDDEN_TITLE] === 'string' && parsed[KEY_HIDDEN_TITLE].trim()
      ? String(parsed[KEY_HIDDEN_TITLE]).trim()
      : DEFAULT_CONFIG.hiddenTitle,
    focusTitle: typeof parsed[KEY_FOCUS_TITLE] === 'string'
      ? String(parsed[KEY_FOCUS_TITLE]).trim()
      : DEFAULT_CONFIG.focusTitle,
    faviconUrl: typeof parsed[KEY_FAVICON_URL] === 'string'
      ? String(parsed[KEY_FAVICON_URL]).trim()
      : DEFAULT_CONFIG.faviconUrl,
    baseTextMode: parsed[KEY_BASE_TEXT_MODE] === 'black' ? 'black' : 'white',
  }
}

export function writeSiteBehaviorConfig(
  customLinks: string | undefined,
  patch: Partial<SiteBehaviorConfig>,
): string {
  const parsed = parseJSON(customLinks)
  const current = readSiteBehaviorConfig(customLinks)
  const next: SiteBehaviorConfig = {
    defaultTitle: (patch.defaultTitle ?? current.defaultTitle).trim() || DEFAULT_CONFIG.defaultTitle,
    hiddenTitle: (patch.hiddenTitle ?? current.hiddenTitle).trim() || DEFAULT_CONFIG.hiddenTitle,
    focusTitle: (patch.focusTitle ?? current.focusTitle).trim(),
    faviconUrl: (patch.faviconUrl ?? current.faviconUrl).trim(),
    baseTextMode: patch.baseTextMode === 'black' ? 'black' : (patch.baseTextMode === 'white' ? 'white' : current.baseTextMode),
  }

  parsed[KEY_DEFAULT_TITLE] = next.defaultTitle
  parsed[KEY_HIDDEN_TITLE] = next.hiddenTitle
  parsed[KEY_FOCUS_TITLE] = next.focusTitle
  parsed[KEY_FAVICON_URL] = next.faviconUrl
  parsed[KEY_BASE_TEXT_MODE] = next.baseTextMode

  return JSON.stringify(parsed)
}
