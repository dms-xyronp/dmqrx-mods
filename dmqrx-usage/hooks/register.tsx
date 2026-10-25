import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snap } from '../types'

const PANE = 'dmqrx-usage'
const snap = atom({ plugin: 'dmqrx-usage', key: 'snap' } as const, null, { shape: 'snap-1' })
const credit = atom({ plugin: 'dmqrx-usage', key: 'credit' } as const, null)          // extra-usage credits (USD) Xyron reported
const creditBase = atom({ plugin: 'dmqrx-usage', key: 'creditBase' } as const, 0)      // session cost when he reported it
const note = atom({ plugin: 'dmqrx-usage', key: 'note' } as const, '')
// Areas whose context must survive a compaction until Xyron confirms them done.
const openAreas = atom({ plugin: 'dmqrx-usage', key: 'openAreas' } as const, [
  'Shell / body rebuild (placeholder shells in the 3D mockup; machined aluminium final)',
  'UI board rebuild (v19; J10 headphone jack part not chosen)',
  'Carrier v30 open items (Gerber + CPL export, L1 derating, TA5 nut clearance, TPS7A8300A stock)',
  'Intern (Gemini) pipeline: quota, queue, log hygiene',
  'Firmware meter pin map 49 OB, 50 OC, 51 OD, 52 OA',
])
const READY_AT = 60   // context fill (%) at which compacting becomes worthwhile

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`)
const resetIn = (iso?: string, now = 0) => {
  if (!iso) return ''
  const m = Math.max(0, (Date.parse(iso) - now) / 60000)
  return m > 1440 ? `resets in ${(m / 1440).toFixed(1)} d` : m > 90 ? `resets in ${(m / 60).toFixed(1)} h` : `resets in ${Math.round(m)} min`
}
const bar = (p: number) => { const n = Math.max(0, Math.min(10, Math.round(p / 10))); return '█'.repeat(n) + '░'.repeat(10 - n) }

async function measure($: EngineInterface) {
  const u = await $.session.usage()
  const s: Snap = { limits: u.rateLimits.map(l => ({ ...l })), ctxPercent: u.context.percent ?? null,
    ctxTokens: u.context.tokens ?? null, usd: u.cost?.usd ?? null, at: await $.clock.now() }
  await update($, snap, () => s)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-pane', description: 'Open the usage pane' })
    await $.command.register({ name: 'credits', description: '/credits <USD left>: set extra-usage credits to track against' })
    await $.command.register({ name: 'open-area', description: '/open-area add <text> | done <n> | list: context kept through compaction' })
    void $.ui.open({ id: PANE, title: 'Usage' })
    void measure($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const s: Snap = { limits: e.rateLimits.map(l => ({ ...l })), ctxPercent: e.context.percent ?? null,
      ctxTokens: e.context.tokens ?? null, usd: e.cost?.usd ?? null, at: await $.clock.now() }
    await update($, snap, () => s)
    return next(e)
  })

  on('command.run', { command: 'usage-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Usage' }); await measure($)
    return { text: 'Usage pane opened.' }
  })

  on('command.run', { command: 'credits' }, async ($, e) => {
    const v = Number.parseFloat(e.args.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(v)) return { text: 'Usage: /credits 13 (USD of extra usage left right now).' }
    const s = await read($, snap)
    await update($, credit, () => v); await update($, creditBase, () => s?.usd ?? 0)
    return { text: `Tracking $${v.toFixed(2)} of extra-usage credits from now.` }
  })

  on('command.run', { command: 'open-area' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'add' && rest.length) { await update($, openAreas, l => [...l, rest.join(' ')]); return { text: 'Added.' } }
    if (verb === 'done') {
      const i = Number.parseInt(rest[0] ?? '', 10) - 1
      let gone = ''
      await update($, openAreas, l => { gone = l[i] ?? ''; return l.filter((_, k) => k !== i) })
      return { text: gone ? `Confirmed done and released: ${gone}` : 'No such item. /open-area list' }
    }
    const l = await read($, openAreas)
    return { text: l.map((a, k) => `${k + 1}. ${a}`).join('\n') || 'No open areas.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, snap)
    const now = await $.clock.now()
    const c = await read($, credit), base = await read($, creditBase)
    const areas = await read($, openAreas)
    const msg = await read($, note)
    const five = s?.limits.find(l => l.kind === 'five_hour')
    const week = s?.limits.find(l => l.kind === 'seven_day')
    const spentSince = s?.usd !== null && s?.usd !== undefined ? Math.max(0, s.usd - base) : null
    const ctx = s?.ctxPercent ?? null
    const isReady = ctx !== null && ctx >= READY_AT
    const row = (label: string, l?: { percentUsed: number; resetsAt?: string }) => (
      <Text>
        {label} {l ? `${bar(l.percentUsed)} ${pct(l.percentUsed)}` : '— no reading yet'} <Text dimColor>{l ? resetIn(l.resetsAt, now) : ''}</Text>
      </Text>
    )
    return (
      <Box flexDirection="column">
        {row('Session (5 h)', five)}
        {row('Week (7 d)   ', week)}
        <Text>
          Context      {ctx === null ? '—' : `${bar(ctx)} ${pct(ctx)}`}
          <Text dimColor>{s?.ctxTokens ? ` ${Math.round(s.ctxTokens / 1000)}k tokens` : ''}</Text>
        </Text>
        <Text>
          Session cost {s?.usd === null || s?.usd === undefined ? '—' : `$${s.usd.toFixed(2)}`}
          <Text dimColor> (API-priced; what extra usage draws once the plan limit is hit)</Text>
        </Text>
        {c !== null && spentSince !== null && (
          <Text>
            Credits      ${Math.max(0, c - spentSince).toFixed(2)} left of ${c.toFixed(2)} <Text dimColor>(${spentSince.toFixed(2)} used since set)</Text>
          </Text>
        )}
        {c === null && <Text dimColor>Type /credits 13 to track extra-usage credits.</Text>}
        <Box>
          <Button key="compact" label={isReady ? '● COMPACT NOW (keeps open areas)' : `○ Compact (not needed yet, ${pct(ctx)})`}
            variant={isReady ? 'primary' : 'plain'}
            onPress={async () => {
              const keep = areas.map((a, k) => `${k + 1}. ${a}`).join('\n')
              const r = await $.session.compact({ instructions:
                'Keep, in full detail, every decision, number, file path and open question about these areas, which Xyron has not yet confirmed as done:\n' +
                keep + '\nAlso keep the standing rules and the latest status of each agent. Drop superseded drafts and resolved debugging.' })
              await update($, note, () => ((r as { skip?: string }).skip ? `Compaction skipped: ${(r as { skip?: string }).skip}` : 'Compacted; open areas kept.'))
            }} />
          <Button key="refresh" label="Refresh" variant="plain" onPress={() => measure($)} />
        </Box>
        {msg !== '' && <Text dimColor>{msg}</Text>}
        <Text dimColor>Kept through compaction until you confirm (/open-area done n):</Text>
        {areas.map((a, k) => <Text dimColor>{k + 1}. {a}</Text>)}
      </Box>
    )
  })
}
