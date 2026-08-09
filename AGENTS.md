# Repository operating boundary

The default engineering scope of this repository is the research platform in
`lab/`. Read `lab/AGENTS.md` before doing research work.

## Protected live system

Do not edit or execute the live trading system unless the user explicitly asks
for a separately scoped live change. Protected paths are:

- `.env*`
- `api.js`, `bot.js`, `config.js`, `monitors.js`
- `indicators/`, `services/`, `strategies/`, `utils/`

Never place orders, start a broker session, alter PM2 processes, deploy, or
write to broker/server resources as part of lab work. Read-only inspection
also needs to be relevant to an explicit task.

## Default verification

Passing software tests is necessary but does not prove that a trading strategy
works. A strategy claim also requires the research gates documented under
`lab/` and a final human decision.
