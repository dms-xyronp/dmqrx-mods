export type Route = { tier: string; effort: string; subagents: string; intern: string; why: string }

declare module 'claude-code' {
  interface PluginState {
    'dmqrx-router': { last: Route | null; isOn: boolean }
  }
}
