# Repository operating boundary

The default engineering scope of this repository is the research platform in
`lab/`. Read `lab/AGENTS.md` before doing research work.

## Protected live system

Do not edit or execute the live trading system unless the user explicitly asks
for a separately scoped live change. Protected paths are:

- `.env*`
- `api.js`, `bot.js`, `config.js`, `monitors.js`
- `indicators/`, `services/`, `strategies/`, `utils/`
