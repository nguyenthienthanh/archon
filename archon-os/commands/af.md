# /af

**Alias for `/archon`** — the pre-v4 name, kept so the command you have been typing since v1
still works.

---

## Usage

```
/af status
/af agents
/af metrics
/af learn status
/af setup cli
```

Every subcommand of `/archon` is accepted here unchanged. See `commands/archon.md` for the
full surface.

## Delegation

Route the invocation to `/archon` with the arguments untouched. There is no behaviour of its
own to implement; this file exists only so the slash name resolves.

## Why it still exists

The plugin was called **Aura Frog** through v3, and `af` was its initials. v4.0.0 renamed it to
Archon OS. Renaming the command without an alias would break every runbook, README and team
wiki that quotes `/af status` — none of which the upgrade can reach.

Full account of the rename: `docs/operations/MIGRATION_V4.md`.

**Deprecation timeline:** soft-deprecated v4.0, warning v5.0, removed v6.0.
