# Codex Mini OS (Web Sandbox)

A minimal browser-based "OS" sandbox for experimenting with Codex-style agents.

## What it includes

- In-memory virtual filesystem
- Terminal with basic commands
- Policy-gated agent tool execution
- Agent plan -> step execution -> audit behavior

## Run

Open this file in a browser:

- `src/codex-mini-os/index.html`

Or serve from project root:

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/src/codex-mini-os/index.html`

## Terminal commands

- `help`
- `pwd`
- `ls [dir]`
- `cd <dir>`
- `cat <file>`
- `write <file> <text>`
- `mkdir <dir>`
- `rm <path>`
- `whoami`
- `clear`

## Codex-specific testing flow

1. Click `Generate Plan`.
2. Toggle permissions (`file.read`, `file.write`, `file.delete`, `shell.exec`).
3. Click `Run One Step` or `Auto Run (5)`.
4. Observe behavior in `Agent Log` and terminal.

## Extend later

- Replace `seedPlan()` with LLM plan output.
- Route tool calls through your backend and real policy engine.
- Persist virtual FS state to local storage or server.
