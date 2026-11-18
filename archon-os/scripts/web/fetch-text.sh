#!/usr/bin/env bash
# fetch-text.sh — run fetch-text.py with the right interpreter.
#
# Interpreter: $ARCHON_PYTHON, else the plugin venv at
# $HOME/.local/share/archon-os/venv (where trafilatura/bs4 are installed — PEP 668
# blocks a system install), else python3. Without the libraries the script still
# works on the stdlib parser.
#
# Install the extractors (optional):
#   python3 -m venv "$HOME/.local/share/archon-os/venv"
#   "$HOME/.local/share/archon-os/venv/bin/pip" install trafilatura beautifulsoup4
set -euo pipefail

VENV_PY="$HOME/.local/share/archon-os/venv/bin/python"
if [ -n "${ARCHON_PYTHON:-}" ]; then
  PY="$ARCHON_PYTHON"
elif [ -x "$VENV_PY" ]; then
  PY="$VENV_PY"
else
  PY=python3
fi

# -I: isolated mode — do not import modules from the cwd or the user site.
exec "$PY" -I "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fetch-text.py" "$@"
