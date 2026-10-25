export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snap = { limits: Limit[]; ctxPercent: number | null; ctxTokens: number | null; usd: number | null; at: number }

declare module 'claude-code' {
  interface PluginState {
    'dmqrx-usage': { snap: Snap | null; credit: number | null; creditBase: number; openAreas: string[]; note: string }
  }
}
