#!/bin/bash
# Archon OS Status Line shim — THIN PASS-THROUGH (v3.8.0-alpha.4+).
#
# The plugin's statusline.sh now owns the FULL multi-line status line:
#   ➜  {dir}  git:({branch}) {✓|✗N} {↑a} {↓b}   🕐 HH:MM
#   🦉 AF v{version} │ {mode} {step} │ {agent}
#   {model} │ {ctx}% ctx
#   💰 … (opt-in: AF_STATUSLINE_COST=1)
#
# Previously this shim added the dir/git prefix and delegated only the AF
# segment. That logic moved INTO the plugin so upgrades carry it — keeping it
# here too would double the dir/git prefix. This shim now just forwards stdin.
#
# Installs that point settings.json at this shim keep working unchanged; installs
# can also point settings.json directly at the plugin script (see
# archon-os/settings.example.json) — identical output.

PLUGIN_STATUSLINE="$HOME/.claude/plugins/marketplaces/archon/archon-os/scripts/statusline.sh"

if [ -x "$PLUGIN_STATUSLINE" ]; then
    exec "$PLUGIN_STATUSLINE"
elif [ -f "$PLUGIN_STATUSLINE" ]; then
    exec bash "$PLUGIN_STATUSLINE"
else
    echo "🦉 AF (plugin missing)"
fi
