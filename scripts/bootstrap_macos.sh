#!/usr/bin/env bash
# Bootstrap Santa Clara Health Intelligence on Apple Silicon macOS.
# Idempotent: safe to re-run. Explains each change before making it.
# Does not modify unrelated shell configuration (no edits to .zshrc/.bashrc).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NODE_VERSION="22"
PYTHON_VERSION="3.12"

info()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$1"; exit 1; }

info "Santa Clara Health Intelligence — local environment bootstrap"

# --- 1. Platform check ---------------------------------------------------
OS_NAME="$(uname -s)"
ARCH="$(uname -m)"
if [[ "$OS_NAME" != "Darwin" ]]; then
  fail "This bootstrap script targets macOS only (found: $OS_NAME)."
fi
if [[ "$ARCH" != "arm64" ]]; then
  warn "Expected Apple Silicon (arm64); found $ARCH. Continuing, but this project is tuned for Apple Silicon."
fi
info "Platform check passed: macOS on $ARCH."

# --- 2. Xcode Command Line Tools -----------------------------------------
if ! xcode-select -p >/dev/null 2>&1; then
  info "Xcode Command Line Tools not found. Installing (this opens a system dialog)..."
  xcode-select --install
  fail "Re-run this script after the Xcode Command Line Tools install finishes."
else
  info "Xcode Command Line Tools already installed."
fi

# --- 3. Homebrew -----------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  fail "Homebrew not found. Install it from https://brew.sh, then re-run this script. (This script will not silently install Homebrew for you — that step touches your shell profile and should be a decision you make explicitly.)"
else
  info "Homebrew already installed ($(brew --version | head -1))."
fi

# --- 4. Node 22 via Homebrew ----------------------------------------------
NODE_FORMULA="node@${NODE_VERSION}"
if ! brew list --versions "$NODE_FORMULA" >/dev/null 2>&1; then
  info "Installing ${NODE_FORMULA} via Homebrew (this project pins Node ${NODE_VERSION} LTS — see .nvmrc and DECISIONS.md DEC-002)..."
  brew install "$NODE_FORMULA"
else
  info "${NODE_FORMULA} already installed via Homebrew."
fi

NODE_BIN_DIR="$(brew --prefix "$NODE_FORMULA")/bin"
export PATH="$NODE_BIN_DIR:$PATH"
info "Using node: $(node --version) from $NODE_BIN_DIR"

# --- 5. pnpm via Corepack (bundled with Node) -----------------------------
if ! command -v corepack >/dev/null 2>&1; then
  fail "corepack not found on PATH even after installing ${NODE_FORMULA}. Something is wrong with the Homebrew node install."
fi
info "Enabling Corepack and pinning pnpm..."
corepack enable
corepack prepare pnpm@latest --activate
info "Using pnpm: $(pnpm --version)"

# --- 6. uv (Python package/interpreter manager) ---------------------------
if ! command -v uv >/dev/null 2>&1; then
  info "Installing uv via Homebrew..."
  brew install uv
else
  info "uv already installed ($(uv --version))."
fi

info "Installing Python ${PYTHON_VERSION} via uv (does not touch system Python)..."
uv python install "$PYTHON_VERSION"

# --- 7. Project dependencies ----------------------------------------------
if [[ -f "$REPO_ROOT/package.json" ]]; then
  info "Installing JS/TS workspace dependencies (pnpm install)..."
  pnpm install
else
  warn "No root package.json yet — skipping pnpm install (expected only before the Phase 1 scaffold lands)."
fi

if [[ -f "$REPO_ROOT/pyproject.toml" ]]; then
  info "Syncing Python dependencies (uv sync)..."
  uv sync
else
  warn "No root pyproject.toml yet — skipping uv sync (expected only before the Phase 1 scaffold lands)."
fi

# --- 8. .env.local -----------------------------------------------------------
if [[ -f "$REPO_ROOT/.env.example" && ! -f "$REPO_ROOT/.env.local" ]]; then
  info "Creating .env.local from .env.example (no secrets are set — all optional credentials remain blank)."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env.local"
else
  info ".env.local already exists or .env.example missing — leaving as-is."
fi

# --- 9. Smoke test ----------------------------------------------------------
info "Bootstrap complete."
info "  node:   $(node --version 2>/dev/null || echo 'not found')"
info "  pnpm:   $(pnpm --version 2>/dev/null || echo 'not found')"
info "  uv:     $(uv --version 2>/dev/null || echo 'not found')"
info "  python: $(uv run python --version 2>/dev/null || echo 'not yet synced')"
info "Next: run 'make dev' to start the web and API dev servers."
