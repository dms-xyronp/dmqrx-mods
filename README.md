# DMQRX mods for Claude Code

Two small mods used on the DMQRX (Double Mark Sound receiver) project.

- **dmqrx-router**: a cheap Haiku call rates every prompt (subagent model tier, effort, whether to fan out, whether to hand research to the Gemini intern) and shows it in the status line. Main turns run on Opus 5.5 at medium effort; subagents are capped at Opus 5.5 medium. `/router show | on | off`.
- **dmqrx-usage**: a side pane with the 5-hour and weekly limits (with reset times), context fill, session cost, an extra-usage credit tracker (`/credits 13`), and a compact button that lights at 60% context and keeps the open areas listed with `/open-area`.

## Install

```
/plugin install dmqrx-router --marketplace dms-xyronp/dmqrx-mods
/plugin install dmqrx-usage --marketplace dms-xyronp/dmqrx-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope installs it for every session).
