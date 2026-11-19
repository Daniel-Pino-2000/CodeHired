// `pnpm companies:check <candidates.json> [--write]`: checks that candidate company boards answer
// with US tech jobs, and with --write adds the ones that do to companies.json. See "How to add a
// company" in CONTRIBUTING.md.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { COMPANIES, companySchema } from './companies.js'
import { checkCandidates, createBoardInspectors, formatCheckLine, formatCompaniesJson, mergeCompanies } from './board-check.js'

const USAGE = `Usage: pnpm companies:check <candidates.json>... [--write] [--min-kept=<n>]

  candidates.json  A list of entries shaped like companies.json's:
                   [{ "name": "Acme", "ats": "greenhouse", "token": "acme", "website": "https://acme.com" }]
  --write          Add the boards that pass to companies.json
  --min-kept       US tech postings a board needs to pass (default 1)
  --help           Show this message`

const COMPANIES_FILE = new URL('./companies.json', import.meta.url)

function fail (message: string): never {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(2)
}

let parsed: ReturnType<typeof parse>
function parse () {
  const argv = process.argv.slice(2)
  return parseArgs({
    // Some pnpm versions forward the `--` separator itself
    args: argv[0] === '--' ? argv.slice(1) : argv,
    allowPositionals: true,
    options: {
      write: { type: 'boolean', default: false },
      'min-kept': { type: 'string', default: '1' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })
}
try {
  parsed = parse()
} catch (error) {
  fail((error as Error).message)
}

const { values, positionals } = parsed
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (positionals.length === 0) fail('Name at least one candidates file.')
const minKept = Number(values['min-kept'])
if (!Number.isInteger(minKept) || minKept < 0) fail('--min-kept must be a whole number.')

const candidates = []
for (const file of positionals) {
  let json: unknown
  try {
    json = JSON.parse(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8'))
  } catch (error) {
    fail(`Cannot read ${file}: ${(error as Error).message}`)
  }
  const result = z.array(companySchema).safeParse(json)
  if (!result.success) {
    fail(`${file} has invalid entries:\n${result.error.issues.map((issue) => `  [${issue.path.join('.')}] ${issue.message}`).join('\n')}`)
  }
  candidates.push(...result.data)
}

const results = await checkCandidates(candidates, { existing: COMPANIES, inspectors: createBoardInspectors(), minKept })
for (const result of results) console.log(formatCheckLine(result))

const passed = results.filter((result) => result.status === 'ok').map((result) => result.company)
console.log(`\n${passed.length} of ${results.length} candidates passed.`)

if (values.write && passed.length > 0) {
  await writeFile(COMPANIES_FILE, formatCompaniesJson(mergeCompanies(COMPANIES, passed)))
  console.log(`Added them to companies.json. Run \`pnpm test\` before committing.`)
} else if (passed.length > 0) {
  console.log('Run again with --write to add them to companies.json.')
}
