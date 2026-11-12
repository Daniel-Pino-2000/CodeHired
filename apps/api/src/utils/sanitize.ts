// Job descriptions arrive as HTML written by other sites. CodeHired only serves them after this
// strict allowlist: text structure (paragraphs, lists, headings, emphasis, links) and nothing that
// runs code, loads anything or changes the page's look. No attribute survives but a link's href.
import sanitizeHtml, { type IOptions, type Transformer } from 'sanitize-html'

// The job page's "About the role" is an h2, so the source's headings start one level below it
const heading = (tagName: 'h3' | 'h4'): Transformer => () => ({ tagName, attribs: {} })

// Links open the other site in a new tab. They point to third-party pages the job's author chose,
// so search engines are told not to follow them (unlike the "Found on" link to the posting).
// Anything but an absolute http(s) or mailto link (relative paths, javascript:, data:) loses its
// href and is left as text: an `<a>` without href. (Renaming the tag instead would leave the
// original closing tag behind.)
const link: Transformer = (_tagName, attribs) => {
  const href = attribs.href?.trim() ?? ''
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return { tagName: 'a', attribs: {} as Record<string, string> }
  return {
    tagName: 'a',
    attribs: { href, target: '_blank', rel: 'nofollow ugc noopener noreferrer' }
  }
}

// Tags that are only worth keeping with something in them: sources pad descriptions with
// `<p>&nbsp;</p>` and `<p><br></p>`
const DROP_WHEN_EMPTY = new Set(['p', 'div', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'a', 'blockquote'])

const OPTIONS: IOptions = {
  allowedTags: ['p', 'div', 'br', 'ul', 'ol', 'li', 'h3', 'h4', 'strong', 'em', 'u', 'a', 'blockquote', 'code', 'pre', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // Tags outside the list disappear but keep their text (a `<span>`, a `<table>`); these go with
  // everything inside them
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'template', 'svg', 'math', 'head', 'title'],
  transformTags: {
    h1: heading('h3'),
    h2: heading('h3'),
    h3: heading('h3'),
    h4: heading('h4'),
    h5: heading('h4'),
    h6: heading('h4'),
    b: () => ({ tagName: 'strong', attribs: {} }),
    i: () => ({ tagName: 'em', attribs: {} }),
    a: link
  },
  exclusiveFilter: (frame) => DROP_WHEN_EMPTY.has(frame.tag) && !frame.text.replace(/&nbsp;|\s/g, '') && !frame.mediaChildren.length
}

// Safe HTML to put in the page as is, or null when nothing is left of it
export function sanitizeDescriptionHtml (html: string | null | undefined): string | null {
  if (!html) return null
  const clean = sanitizeHtml(html, OPTIONS)
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br /><br />')
    .trim()
  return clean || null
}
