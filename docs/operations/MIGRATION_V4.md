---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: active-user
---

# Upgrading to v4: the Aura Frog → Archon OS rename

**Short version: upgrade and keep working.** Every old name still works. Nothing on your disk
is moved or deleted, no approval you granted is revoked, and no setting you exported stops
being read. This page exists so you know what changed and when the old names go away.

The plugin was called **Aura Frog** through v3. It is **Archon OS** from v4.0.0. The name was
the only thing wrong with it, so the rename is a rename — not a rewrite.

---

## Do I have to do anything?

No. Read the next section if you want the new names, or the
[compatibility table](#whats-still-accepted) if something looks broken.

If you want to check that you are *not* relying on a legacy name — useful before v5 removes
them — set `ARCHON_ENV_COMPAT_OFF=true` for a session. That switches off the environment
bridge. If everything still behaves, you are clean.

---

## What changed

| Thing | Before (v3) | Now (v4) |
|---|---|---|
| Product name | Aura Frog | Archon OS |
| Marketplace | `aurafrog` | `archon` |
| Plugin | `aura-frog` | `archon-os` |
| Install command | `/plugin install aura-frog@aurafrog` | `/plugin install archon-os@archon` |
| CLI | `af` | `archon` (`af` kept as an alias) |
| Environment variables | `AF_*`, `AURA_FROG_*` | `ARCHON_*` |
| Per-project runtime state | `.aura-frog/runtime/` | `.archon/runtime/` |
| `.envrc` trust file | `~/.config/aura-frog/envrc-trust.json` | `~/.config/archon/envrc-trust.json` |
| Scan-exclusion file | `.afignore` | `.archonignore` |
| Scratch output root | `/tmp/aura-frog-<uid>/` | `/tmp/archon-<uid>/` |
| Statusline label | `🐸 AF v3.8.0 │ deep P3 │ architect` | `archon v4.0.0 │ deep P3 │ architect` |

The frog is retired. There is an owl now, and
[`assets/brand/README.md`](../../assets/brand/README.md) explains why.

---

## What's still accepted

### Environment variables — bridged

Both legacy prefixes are mirrored onto `ARCHON_*` at startup:

```bash
export AF_DEFAULT_COVERAGE=85        # still read, as ARCHON_DEFAULT_COVERAGE
export AURA_FROG_TDD_ENFORCE=true    # still read, as ARCHON_TDD_ENFORCE
```

**The new name wins where both are set.** If you have `AF_DEBUG=1` and `ARCHON_DEBUG=0`, you
get `0` — so you can migrate one variable at a time without the old value fighting the new one.

Two implementations keep the halves of the plugin in agreement:
`archon-os/hooks/lib/env-compat.cjs` for hooks, `archon-os/scripts/lib/env-compat.sh` for the
statusline and plan scripts.

**Scheduled for removal in v5.** Rename your exports whenever it suits you.

### `.envrc` approvals — not revoked

Every entry in the trust file is an `.envrc` a human approved by hand, so the move does not
throw them away:

- **Reading** (`envrc-guarded-source.sh`): prefers `~/.config/archon/`, falls back to
  `~/.config/aura-frog/` while the new file is absent.
- **Writing** (`archon envrc allow`): copies the legacy file across on first use and says so,
  then only writes the new one.

A revocation still revokes. The fallback triggers on *the new file being absent*, not on *a
path being missing from it* — so once the new file exists, removing a path from it is final.

### Runtime state — follows the state

`.archon/runtime/` is the new home, but a project that was mid-run when the plugin upgraded
still has a model stack pushed under `.aura-frog/runtime/`. The resolver reads whichever
directory actually holds the file, per file, so an in-flight stack drains where it was pushed
instead of being orphaned. New projects only ever see `.archon/`.

### `.archonignore` — legacy name honoured

`.afignore` lives in *your* repo, so an upgrade cannot rewrite it. Both names are read,
`.archonignore` first; they are not merged. Rename it when convenient.

### The `af` command — still there

`archon setup cli` links both `archon` and `af` to the same script. Invoked as `af`, it prints
its help as `af`, so copy-pasted instructions keep working.

---

## Doing the migration yourself

Optional. Nothing below is required for v4, and all of it will be required by v5.

```bash
# 1. Rename your exports. Check what you actually have first:
env | grep -E '^(AF_|AURA_FROG_)'

# 2. Move the trust file (or just run `archon envrc allow` once and let it copy):
mkdir -p ~/.config/archon
cp ~/.config/aura-frog/envrc-trust.json ~/.config/archon/envrc-trust.json

# 3. Per project, if you have either of these:
git mv .afignore .archonignore
rm -rf .aura-frog            # runtime state only — regenerated, never committed

# 4. Verify nothing depended on a legacy name:
ARCHON_ENV_COMPAT_OFF=true archon doctor
```

---

## Things the rename deliberately did not touch

- **`.aura/plans/`** — a *different*, older legacy path, from before plans moved to
  `.claude/plans/` in v3.7.3. Its own fallback is unchanged and is also slated for removal.
  Override it with `ARCHON_PLANS_DIR`.
- **Changelog entries for v3 and earlier** — they still name the variables as they were at the
  time, because a changelog that edits its own history is not a record.

---

## If something is broken

1. `archon doctor` — reports plugin location, hook count, `.envrc` trust state.
2. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — symptom-first fixes.
3. [Open an issue](https://github.com/nguyenthienthanh/archon/issues) — include the output of
   `env | grep -E '^(AF_|AURA_FROG_|ARCHON_)'` with any secrets removed.
