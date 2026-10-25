import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Route } from '../types'

// House rule (Xyron): every prompt runs on Opus 5.5 at medium effort. Subagents may use
// cheaper models or lower effort, never more than Opus 5.5 medium. A Haiku call (low effort,
// ~200 tokens out) rates each prompt so the main agent knows whether to fan out, which tier a
// subagent needs, and whether the free Gemini intern should take part of it.
const MAIN = 'claude-opus-5-5'
const RANK: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }
const last = atom({ plugin: 'dmqrx-router', key: 'last' } as const, null)
const isOn = atom({ plugin: 'dmqrx-router', key: 'isOn' } as const, true)

const RULES = `Rate a user prompt for an agent team. Reply with ONE line of JSON only:
{"tier":"haiku|sonnet|opus","effort":"low|medium","subagents":"none|1|2-3","intern":"no|yes: <short web-research task>","why":"<=12 words"}
Guide: haiku = lookups, file moves, formatting, status. sonnet = routine code edits, single-file fixes, validation checks.
opus = multi-step design, PCB/CAD layout, architecture, anything ambiguous. effort medium unless trivial.
subagents only for independent checks (validator) or wide fan-out; none for chat and small edits.
intern (free Gemini Lite/Flash models: gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.8-flash) = slow background web research
(part numbers, stock, datasheet numbers) that the team can use later; never for urgent or design work.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'router', description: 'Prompt router: /router on | off | show' })
    return next(e)
  })

  on('command.run', { command: 'router' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOn, () => arg === 'on')
      return { text: `Router ${arg}. Main model rule ${arg === 'on' ? 'enforced' : 'paused'}.` }
    }
    const r = await read($, last)
    return { text: r ? `Last route: ${JSON.stringify(r)}` : 'No prompt rated yet.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if ((e as { command?: unknown }).command || !(await read($, isOn)) || e.text.trim().length < 12) return next(e)
    const r = await $.model.complete({ model: 'haiku', effort: 'low', maxTokens: 160, timeoutMs: 8000,
      system: [{ text: RULES, cache: true }], prompt: e.text.slice(0, 4000) } as never)
    let route: Route | null = null
    if ((r as { isAnswered?: boolean }).isAnswered) {
      try {
        const m = String((r as { text: string }).text).match(/\{[\s\S]*\}/)
        if (m) route = JSON.parse(m[0]) as Route
      } catch { route = null }
    }
    if (!route) return next(e)
    await update($, last, () => route)
    $.ui.status(`route: sub ${route.tier}/${route.effort} · fan-out ${route.subagents} · intern ${route.intern.startsWith('yes') ? 'yes' : 'no'}`)
    const tag = `\n\n[router · main Opus 5.5 medium · subagent tier ${route.tier}/${route.effort} · subagents ${route.subagents} · intern ${route.intern} · ${route.why}]`
    return next({ ...e, text: e.text + tag })
  })

  on('turn.step', async function* ($, e, next) {
    if (!(await read($, isOn))) return yield* next(e)
    const capped = typeof e.effort === 'string' && (RANK[e.effort] ?? 0) > RANK.medium
    if (e.agentId === undefined) return yield* next({ ...e, model: MAIN, effort: 'medium' })
    const aboveOpus = /fable|mythos/i.test(e.model)
    if (aboveOpus || capped) return yield* next({ ...e, model: aboveOpus ? MAIN : e.model, effort: capped ? 'medium' : e.effort })
    return yield* next(e)
  })
}
