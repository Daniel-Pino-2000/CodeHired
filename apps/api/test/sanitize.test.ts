import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { sanitizeDescriptionHtml } from '../src/utils/sanitize.js'

const LINK_ATTRIBUTES = 'target="_blank" rel="nofollow ugc noopener noreferrer"'

describe('sanitizeDescriptionHtml', () => {
  test('removes scripts, event handlers and anything that loads or runs', () => {
    assert.equal(sanitizeDescriptionHtml('<img src=x onerror=alert(1)><p>Hello</p>'), '<p>Hello</p>')
    assert.equal(sanitizeDescriptionHtml('<p>Hello</p><script>alert(1)</script>'), '<p>Hello</p>')
    assert.equal(sanitizeDescriptionHtml('<p onclick="alert(1)" style="color:red" class="x" id="y">Hi</p>'), '<p>Hi</p>')
    assert.equal(
      sanitizeDescriptionHtml('<svg><script>alert(1)</script></svg><iframe src="https://evil.example">x</iframe><style>body{display:none}</style><object data="x"></object><form><input value="1"></form>'),
      null
    )
    assert.equal(sanitizeDescriptionHtml('<noscript><p>hidden</p></noscript><p>Shown</p>'), '<p>Shown</p>')
  })

  test('keeps text that only looks like HTML as text', () => {
    assert.equal(sanitizeDescriptionHtml('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    assert.equal(sanitizeDescriptionHtml('<p>Tom &amp; Jerry use C++ &lt;3</p>'), '<p>Tom &amp; Jerry use C++ &lt;3</p>')
  })

  test('keeps the structure: paragraphs, lists, headings below the page title, emphasis', () => {
    assert.equal(
      sanitizeDescriptionHtml('<h1>Role</h1><h2>You</h2><h5>Perks</h5><ul><li><b>Go</b> and <i>Rust</i></li></ul><ol><li>One</li></ol><p>A<br>B</p>'),
      '<h3>Role</h3><h3>You</h3><h4>Perks</h4><ul><li><strong>Go</strong> and <em>Rust</em></li></ul><ol><li>One</li></ol><p>A<br />B</p>'
    )
    // Tags outside the list go, their text stays
    assert.equal(sanitizeDescriptionHtml('<p><span style="font-size:20px">Big</span> <font color="red">red</font></p>'), '<p>Big red</p>')
  })

  test('only keeps absolute http(s) and mailto links, opened in a new tab and not followed', () => {
    assert.equal(
      sanitizeDescriptionHtml('<p><a href="https://example.com/benefits" title="t" onclick="x()">Benefits</a></p>'),
      `<p><a href="https://example.com/benefits" ${LINK_ATTRIBUTES}>Benefits</a></p>`
    )
    assert.equal(sanitizeDescriptionHtml('<a href="mailto:jobs@example.com">Email us</a>'), `<a href="mailto:jobs@example.com" ${LINK_ATTRIBUTES}>Email us</a>`)
    for (const href of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', '/careers', '//evil.example', 'vbscript:x']) {
      assert.equal(sanitizeDescriptionHtml(`<p><a href="${href}">Link</a></p>`), '<p><a>Link</a></p>', href)
    }
  })

  test('drops the empty padding sources add, and returns null when nothing is left', () => {
    assert.equal(sanitizeDescriptionHtml('<p>&nbsp;</p><p><br></p><div> </div><p>Text</p><ul><li></li></ul>'), '<p>Text</p>')
    assert.equal(sanitizeDescriptionHtml('<p>A<br><br><br><br>B</p>'), '<p>A<br /><br />B</p>')
    assert.equal(sanitizeDescriptionHtml('<p> </p>'), null)
    assert.equal(sanitizeDescriptionHtml(''), null)
    assert.equal(sanitizeDescriptionHtml(null), null)
  })

  test('is stable: sanitizing twice changes nothing', () => {
    const once = sanitizeDescriptionHtml('<h2>Team</h2><p><a href="https://example.com">Site</a> <b>bold</b></p><ul><li>One</li></ul>')!
    assert.equal(sanitizeDescriptionHtml(once), once)
  })
})
