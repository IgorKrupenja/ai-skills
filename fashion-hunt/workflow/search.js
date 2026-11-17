export const meta = {
  name: 'fashion-hunt-search',
  description: "Run a fashion-hunt search's agents at once, and a second round for links an agent left unchecked",
  whenToUse: 'From the fashion-hunt skill, once the scans have run, with the briefs it writes',
  phases: [
    { title: 'Search', detail: 'every shop, judging and brand agent at once' },
    { title: 'Second round', detail: 'one more agent for the links an agent left unchecked' },
  ],
}

// args: {agents: [{id, label, kind: "shop" | "brand", brief, model?}], status?: {runDir, skillDir}}, the
// briefs SKILL.md describes, each with its tab tag as id. With status, each agent records itself
// as done when it ends (listings.ts status), so the main chat can update the report page meanwhile.
// Shop agents report as REPORT; a brand agent replies in the text its file gives. Returns each
// agent's report, and its second round's where it had one.

const REPORT = {
  type: 'object',
  properties: {
    shops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shop: { type: 'string' },
          status: { type: 'string', description: 'searched | partly searched: <what is left> | blocked: <why> | not searched: <why>' },
          searched: { type: 'string', description: 'the scans, queries and filters used, with result counts' },
          saved: { type: 'string', description: '<n> matches, <n> near matches' },
          unverified: {
            type: 'array',
            description: 'links shortlisted but not checked',
            items: { type: 'object', properties: { url: { type: 'string' }, why: { type: 'string' } }, required: ['url', 'why'] },
          },
          notes: { type: 'string', description: 'fees, shipping, currency, authentication offered, anything worth knowing' },
        },
        required: ['shop', 'status', 'searched', 'saved', 'unverified', 'notes'],
      },
    },
  },
  required: ['shops'],
}

// No one is there to ask an agent to stop, as the skill's timers did, so each keeps its own time
const TIME =
  '\n\nNo one will ask you to stop in this run, so keep time yourself: run `date +%s` when you start and now and then after. ' +
  'At 13 minutes, stop checking, save what is settled, close your tab and report, listing what is left as unverified.'
const REPORT_NOTE =
  "\n\nReport with the structured output instead of the text block your file describes: one entry per shop, with the same content, and every link you shortlisted but didn't check under unverified."

// Each agent records itself as done, as id, or id-2 in a second round, for the page's progress
const done = id =>
  args && args.status && id
    ? `\n\nRight before you report, record that you are done, so the report page shows it: run \`bun ${args.status.skillDir}/scripts/listings.ts status ${args.status.runDir} ${id} "<your status: searched, partly searched: ..., blocked: ... or not searched: ...>" --unverified <how many links you leave unchecked>\`.`
    : ''

const agents = (args && args.agents) || []
if (!agents.length) throw new Error('args.agents is empty: pass the briefs the fashion-hunt skill writes')
const opts = (a, extra) => ({ phase: 'Search', ...(a.model ? { model: a.model } : {}), ...extra })

// A second round gets the first brief with only the links left, in a tab of its own
const second = (a, report) => {
  const links = report.shops.flatMap(s => s.unverified.map(u => `- ${u.url} (${u.why})`))
  // The tag without the sentence's full stop after it
  const tag = ((a.brief.match(/tab tag is ([A-Za-z0-9._-]+)/) || [])[1] || '').replace(/\.+$/, '')
  return (
    a.brief +
    '\n\nSecond round: an agent before you searched this and shortlisted these links but could not check them. Check only these and save what matches, as your file says' +
    (tag ? `, in a tab tagged ${tag}-2` : '') +
    ':\n' +
    links.join('\n') +
    TIME +
    done(a.id && `${a.id}-2`) +
    REPORT_NOTE
  )
}

phase('Search')
log(`${agents.length} agents: ${agents.map(a => a.label).join(', ')}`)
const results = await pipeline(
  agents,
  a =>
    a.kind === 'brand'
      ? agent(a.brief + TIME + done(a.id), opts(a, { label: a.label }))
      : agent(a.brief + TIME + done(a.id) + REPORT_NOTE, opts(a, { label: a.label, schema: REPORT })),
  async (report, a) => {
    const done = { label: a.label, kind: a.kind, report }
    if (a.kind === 'brand' || !report || !report.shops.some(s => s.unverified.length)) return done
    const links = report.shops.reduce((n, s) => n + s.unverified.length, 0)
    log(`${a.label}: a second round for ${links} links left unchecked`)
    const again = await agent(second(a, report), opts(a, { label: `${a.label}, second round`, phase: 'Second round', schema: REPORT }))
    return { ...done, second: again }
  },
)
const lost = agents.filter((a, i) => !results[i] || !results[i].report).map(a => a.label)
if (lost.length) log(`no report from ${lost.join(', ')}: what they saved is kept`)
return { results: results.map((r, i) => r || { label: agents[i].label, kind: agents[i].kind, report: null }) }
