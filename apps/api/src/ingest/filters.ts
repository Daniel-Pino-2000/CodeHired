// Which postings CodeHired keeps: tech roles in the US or remote from the US. Company boards list
// every opening worldwide, so the ATS adapters run these rules before normalizing. They are
// deliberately simple keyword rules; #31 refines them.

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
}

const STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]))

// Tech hubs that boards often write without a state: "San Francisco", "NYC", "Bay Area"
const CITY_STATES: Record<string, string> = {
  'san francisco': 'CA',
  'san francisco bay area': 'CA',
  'bay area': 'CA',
  sf: 'CA',
  'palo alto': 'CA',
  'mountain view': 'CA',
  'menlo park': 'CA',
  'san jose': 'CA',
  sunnyvale: 'CA',
  'los angeles': 'CA',
  'san diego': 'CA',
  'new york': 'NY',
  'new york city': 'NY',
  nyc: 'NY',
  seattle: 'WA',
  bellevue: 'WA',
  redmond: 'WA',
  austin: 'TX',
  dallas: 'TX',
  houston: 'TX',
  boston: 'MA',
  cambridge: 'MA',
  chicago: 'IL',
  denver: 'CO',
  boulder: 'CO',
  atlanta: 'GA',
  miami: 'FL',
  pittsburgh: 'PA',
  philadelphia: 'PA',
  'washington dc': 'DC',
  'washington d.c.': 'DC',
  'salt lake city': 'UT',
  phoenix: 'AZ'
}

// "US", "USA", "U.S." (upper case only, so the word "us" does not count) and "United States"
const US_CODE = /(?<![A-Za-z])(?:USA|US|U\.S\.(?:A\.)?)(?![A-Za-z])/g
const US_NAME = /\bunited states(?: of america)?\b/gi

function mentionsUsCountry (text: string) {
  // Global regexes keep their position between calls; `match` resets it
  return text.match(US_CODE) !== null || text.match(US_NAME) !== null
}

// "Multiple Locations", "United States and Canada", "Remote from the US", "Central - United States": not a city
const NOT_A_CITY = /\b(locations?|anywhere|multiple|various|select|nationwide|any|cities|states|region|and|friendly|from|the|in|central|(north|south)(east|west)|midwest|(east|west) coast)\b/i
const looksLikeCity = (text: string) => /^[\p{L} .'’-]{2,40}$/u.test(text) &&
  !NOT_A_CITY.test(text) && !NON_US.test(text) && !US_ELIGIBLE_REGION.test(text)

// Places that would otherwise look American: "Bengaluru, IN" reads as Indiana, "Remote - CA" as California
const NON_US = /\b(canada|toronto|vancouver|montr[eé]al|ottawa|calgary|ontario|qu[eé]bec|british columbia|mexico|brazil|argentina|colombia|united kingdom|uk|england|scotland|london|ireland|dublin|germany|berlin|munich|france|paris|spain|madrid|barcelona|portugal|lisbon|netherlands|amsterdam|poland|warsaw|switzerland|zurich|sweden|stockholm|denmark|copenhagen|europe|emea|apac|latam|india|bengaluru|bangalore|hyderabad|pune|chennai|mumbai|delhi|gurgaon|gurugram|noida|singapore|japan|tokyo|korea|seoul|china|beijing|shanghai|hong kong|taiwan|australia|sydney|melbourne|new zealand|israel|tel aviv|philippines|manila|vietnam|indonesia|uae|dubai|greece|romania|bucharest|norway|oslo|finland|helsinki|italy|milan|rome|austria|vienna|belgium|brussels|czech|prague|hungary|budapest|serbia|belgrade|ukraine|kyiv|turkey|istanbul|south africa|nigeria|egypt|kenya|chile|peru|costa rica|uruguay|thailand|malaysia|pakistan|saudi arabia|qatar|luxembourg|slovenia|estonia|lithuania|latvia|croatia|bulgaria)\b/i

// Remote roles open to more than the US, which US applicants can take
const US_ELIGIBLE_REGION = /\b(global|worldwide|anywhere|americas?|amer|namer|north america)\b/i

const WORKPLACE_WORDS = /\b(remote(?:[- ]friendly)?|hybrid|on-?site|in[- ]office|in[- ]person|hq|headquarters|office)\b/gi

// Two-letter codes that more often mean a country: Canada, India, Germany
const AMBIGUOUS_CODES = new Set(['CA', 'IN', 'DE'])

export interface UsPlace {
  city: string | null
  // Two-letter state code
  state: string | null
  // Null for a remote role open to a wider region that includes the US ("Remote, Global")
  country: 'US' | null
  remote: boolean
}

function stateCode (text: string) {
  const cleaned = text.replace(/\./g, '').trim()
  // Codes in upper case only: "in" is a word, "IN" is Indiana
  if (/^[A-Z]{2}$/.test(cleaned) && US_STATES[cleaned]) return cleaned
  return STATE_BY_NAME.get(cleaned.toLowerCase()) ?? null
}

// "Mountain View CA" → ["Mountain View", "CA"]
function splitTrailingCode (token: string) {
  const match = /^(.+?)\s+([A-Z]{2})$/.exec(token)
  return match && US_STATES[match[2]] ? [match[1], match[2]] : [token]
}

// The state and the city next to it: "Austin, TX", "WA - Seattle", "San Francisco - SF9"
function findStateAndCity (tokens: string[]): { state: string | null, city: string | null } {
  if (tokens.length === 0) return { state: null, city: null }
  // A list of cities, not a city and its state: "SF, New York, Seattle", "San Francisco, NY, Seattle"
  const firstCityState = CITY_STATES[tokens[0].toLowerCase()]
  if (firstCityState && (tokens.length > 2 || CITY_STATES[tokens[1]?.toLowerCase()])) {
    return { state: firstCityState, city: tokens[0] }
  }
  // A state after the city is the usual order, so look there first: "Washington, DC" is not in WA
  for (const index of [...tokens.keys()].slice(1).concat(0)) {
    const state = stateCode(tokens[index])
    if (!state) continue
    const city = index > 0 ? tokens[index - 1] : tokens[1] ?? null
    // "California, CA" has no city; "New York, NY" does
    return { state, city: city && stateCode(city) === state && !CITY_STATES[city.toLowerCase()] ? null : city }
  }
  const city = tokens.find((token) => CITY_STATES[token.toLowerCase()]) ?? tokens[0] ?? null
  return { state: city ? CITY_STATES[city.toLowerCase()] ?? null : null, city }
}

// One place: "Austin, TX", "San Francisco, California, United States", "Remote (US)", "New York, NY (HQ)"
function parsePlace (text: string, assumeUs: boolean): UsPlace | null {
  const mentionsUs = mentionsUsCountry(text)
  if (!mentionsUs && NON_US.test(text)) return null
  const remote = /\bremote\b/i.test(text)

  // Keep only the place name: drop notes in parentheses, the country and workplace words
  const tokens = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(US_CODE, ' ')
    .replace(US_NAME, ' ')
    .replace(WORKPLACE_WORDS, ' ')
    .split(/,|\s[-–—]\s/)
    .map((token) => token.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').replace(/\s+/g, ' '))
    .filter(Boolean)
    .flatMap(splitTrailingCode)

  // A lone "CA" may well mean Canada
  const lone = tokens.length === 1 ? tokens[0].replace(/\./g, '') : null
  if (lone && AMBIGUOUS_CODES.has(lone) && !mentionsUs && !assumeUs) return null

  let { state, city } = findStateAndCity(tokens)
  // "New York" alone is the city, not the state
  if (tokens.length === 1 && CITY_STATES[tokens[0].toLowerCase()]) {
    city = tokens[0]
    state = CITY_STATES[tokens[0].toLowerCase()]
  }
  if (city && !looksLikeCity(city)) city = null

  if (state === null && !mentionsUs && !assumeUs) {
    // "Remote, Global", "Remote - Americas"
    return remote && US_ELIGIBLE_REGION.test(text) ? { city: null, state: null, country: null, remote } : null
  }
  return { city, state, country: 'US', remote }
}

// The first US place in a location string, which may list several: "SF / NYC", "Austin, TX; Remote".
// `assumeUs` is for sources that state the country separately (Lever's `country`, Ashby's address).
// Null when no place is in the US, or when nothing says so ("Remote" alone).
export function parseUsLocation (text: string | null | undefined, { assumeUs = false } = {}): UsPlace | null {
  if (!text) return null
  for (const segment of text.split(/\s*(?:;|\||\/|•|\bor\b)\s*/i)) {
    if (!segment.trim()) continue
    const place = parsePlace(segment, assumeUs)
    if (place) return place
  }
  return null
}

// "Austin, TX", "Maryland", "Remote (Seattle, WA)", "Remote (US)", "United States", "Remote"
export function formatUsLocation ({ city, state, country, remote }: UsPlace) {
  const place = city && state ? `${city}, ${state}` : city ?? (state ? US_STATES[state] : null)
  if (remote) return place ? `Remote (${place})` : country === 'US' ? 'Remote (US)' : 'Remote'
  return place ?? 'United States'
}

// A place that names a country or city outside the US and does not mention the US: "Portugal",
// "London, UK". Used to distrust other fields of the same posting that say otherwise.
export function isNonUsPlace (text: string | null | undefined) {
  return !!text && NON_US.test(text) && !mentionsUsCountry(text)
}

// Country names and codes the sources use for the US
export function isUsCountry (country: string | null | undefined) {
  return !!country && /^(us|usa|united states( of america)?)$/i.test(country.trim())
}

// The role nouns of the jobs CodeHired lists
const TECH_TITLE = /\b(engineer(s|ing)?|developer|programmer|sdet|devops|devsecops|sre|site reliability|architect|(data|machine learning|ml|ai|research|applied|computer) scientists?)\b/i

// Engineering titles that are not software work, and roles that only sit near engineering
const NON_TECH_TITLE = /\b(sales|solutions?|support|customer|field|account|accounting|finance|legal|counsel|recruit(er|ing)?|sourcer|talent|marketing|program manager|project manager|coordinator|assistant|mechanical|electrical|manufacturing|hardware|civil|structural|structures|materials|composites|mechatronics|chemical|industrial|process|facilities|construction|propulsion|avionics|thermal|optical|rf|analog|asic|fpga|technician)\b/i

const NON_TECH_DEPARTMENT = /\b(sales|marketing|customer|support|recruiting|talent|people|legal|finance|g&a)\b/i

// A software or data role, judged from the title and, when given, the departments
export function isTechRole ({ title, departments = [] }: { title: string, departments?: ReadonlyArray<string | null | undefined> }) {
  // "Software Engineer, Ads Solutions" is a software engineer, wherever the team sits
  if (/\bsoftware (engineer|developer)/i.test(title) && !/\bsales\b/i.test(title)) return true
  if (!TECH_TITLE.test(title) || NON_TECH_TITLE.test(title)) return false
  // "Engineer" in Sales is a sales engineer, whatever the title says; "Software Engineer" is not
  const inNonTechDepartment = departments.some((department) => department && NON_TECH_DEPARTMENT.test(department))
  return !inNonTechDepartment || /\bsoftware\b/i.test(title)
}
