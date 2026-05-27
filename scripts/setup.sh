#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

NODE_MAJOR=24
PY_VERSION=3.13

c_red='\033[31m'; c_grn='\033[32m'; c_ylw='\033[33m'; c_blu='\033[34m'; c_dim='\033[2m'; c_rst='\033[0m'
say()   { printf "${c_blu}==>${c_rst} %s\n" "$*"; }
ok()    { printf "${c_grn}✓${c_rst}  %s\n" "$*"; }
warn()  { printf "${c_ylw}!${c_rst}  %s\n" "$*"; }
err()   { printf "${c_red}✗${c_rst}  %s\n" "$*" >&2; }
have()  { command -v "$1" >/dev/null 2>&1; }
sudo_run() {
  if have sudo; then sudo "$@"; else "$@"; fi
}

OS="$(uname -s)"
DISTRO=""
PKG=""
ID_LIKE_VAL=""
if [[ "$OS" == "Linux" ]]; then
  if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    DISTRO="${ID:-unknown}"
    ID_LIKE_VAL="${ID_LIKE:-}"
  fi
  case "$DISTRO" in
    ubuntu|debian|pop|linuxmint|zorin|elementary|neon|kali|raspbian|tuxedo) PKG=apt ;;
    fedora|rhel|rocky|almalinux|centos) PKG=dnf ;;
    arch|manjaro|endeavouros|garuda)    PKG=pacman ;;
    *)
      case " $ID_LIKE_VAL " in
        *" ubuntu "*|*" debian "*)           PKG=apt ;;
        *" fedora "*|*" rhel "*|*" centos "*) PKG=dnf ;;
        *" arch "*)                          PKG=pacman ;;
        *)                                   PKG="" ;;
      esac
      ;;
  esac
elif [[ "$OS" == "Darwin" ]]; then
  DISTRO=macos
  PKG=brew
fi

mkdir -p "$HOME/.local/bin"

PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '/\.pyenv/shims' | paste -sd: -)"
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

UV="$HOME/.local/bin/uv"

confirm() {
  local prompt="$1"
  if [[ "${ASSUME_YES:-0}" == "1" ]]; then return 0; fi
  read -r -p "$prompt [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------
say "Detected OS: $OS / $DISTRO  (package manager: ${PKG:-none})"
if [[ -z "$PKG" ]]; then
  warn "Unknown package manager — skipping base package install. Ensure curl + git are present."
fi

# ---------------------------------------------------------------------
install_base_packages() {
  [[ "${SKIP_SYSTEM:-0}" == "1" ]] && { warn "SKIP_SYSTEM=1 — skipping base package install."; return; }
  [[ -z "$PKG" ]] && return

  have curl || { err "curl is required to bootstrap. Install it first (e.g. 'sudo apt install curl') and re-run."; exit 1; }

  say "Installing base build tools…"
  case "$PKG" in
    apt)
      sudo_run apt-get update -y || warn "apt-get update reported errors; continuing."
      sudo_run apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl gnupg pkg-config libssl-dev libffi-dev git
      ;;
    dnf)
      sudo_run dnf install -y gcc gcc-c++ make ca-certificates curl gnupg pkgconf \
        openssl-devel libffi-devel git
      ;;
    pacman)
      sudo_run pacman -Syu --noconfirm --needed base-devel curl gnupg openssl libffi git
      ;;
    brew)
      have brew || { err "Install Homebrew first: https://brew.sh"; exit 1; }
      brew update
      brew install pkg-config openssl libffi
      ;;
  esac
  ok "Base packages installed."
}

# ---------------------------------------------------------------------
require_docker() {
  if ! have docker; then
    err "Docker is required for the dev infrastructure (Postgres + Redis + LocalStack)."
    err "Install Docker Engine + the Compose plugin: https://docs.docker.com/engine/install/"
    err "On Linux, add yourself to the 'docker' group and re-login, then re-run this script."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose v2 plugin not found. Install it (docker-compose-plugin) and re-run."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "The Docker daemon is not reachable. Start Docker (and ensure your user can access it), then re-run."
    exit 1
  fi
  ok "Docker ready: $(docker --version | awk '{print $3}' | tr -d ',')  /  compose $(docker compose version --short 2>/dev/null || echo v2)"
}

# ---------------------------------------------------------------------
install_uv() {
  if [[ -x "$UV" ]] && "$UV" --version >/dev/null 2>&1; then
    ok "uv already installed at $UV: $("$UV" --version)"
    return
  fi
  say "Installing uv to $HOME/.local/bin…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  if [[ ! -x "$UV" ]] || ! "$UV" --version >/dev/null 2>&1; then
    err "uv install failed — expected $UV to be a working binary."
    exit 1
  fi
  ok "uv installed: $("$UV" --version)"
}

install_python() {
  say "Ensuring Python $PY_VERSION via uv…"
  "$UV" python install "$PY_VERSION"
  ok "Python $PY_VERSION ready."
}

# ---------------------------------------------------------------------
install_node() {
  local current=""
  if have node; then current="$(node -v)"; fi
  if [[ "$current" =~ ^v$NODE_MAJOR\. ]]; then
    ok "Node $current already installed."
    return
  fi
  [[ "${SKIP_SYSTEM:-0}" == "1" ]] && { warn "SKIP_SYSTEM=1 — skipping Node install."; return; }
  [[ -z "$PKG" ]] && { warn "No package manager — install Node $NODE_MAJOR manually if tooling needs it."; return; }
  say "Installing Node $NODE_MAJOR…"
  case "$PKG" in
    apt)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo_run -E bash -
      sudo_run apt-get install -y nodejs
      ;;
    dnf)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | sudo_run bash -
      sudo_run dnf install -y nodejs
      ;;
    pacman)
      sudo_run pacman -S --noconfirm --needed nodejs npm
      ;;
    brew)
      brew install "node@${NODE_MAJOR}"
      brew link --overwrite --force "node@${NODE_MAJOR}" || true
      ;;
  esac
}

install_bun() {
  if have bun && bun --version >/dev/null 2>&1; then
    ok "bun already installed: $(bun --version)"
    return
  fi
  say "Installing bun…"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if ! have bun; then
    err "bun install failed — expected it on PATH at \$HOME/.bun/bin."
    exit 1
  fi
  ok "bun installed: $(bun --version)"
}

# ---------------------------------------------------------------------
start_infra() {
  say "Starting dev infrastructure (Postgres + Redis + LocalStack S3) via Docker Compose…"
  docker compose up -d --wait
  ok "Infrastructure is up — postgres:5432, redis:6379, localstack(S3):4566."
}

# ---------------------------------------------------------------------
configure_env() {
  if [[ -f .env ]]; then
    ok ".env already exists — leaving it untouched."
  else
    cp .env.example .env
    ok "Copied .env.example → .env"
  fi
}

install_project_deps() {
  say "Installing project dependencies (uv sync + bun install)…"
  UV_PROJECT_ENVIRONMENT=.venv "$UV" venv .venv --python "$PY_VERSION"
  UV_PROJECT_ENVIRONMENT=.venv "$UV" sync --all-packages --all-groups
  bun install
  ok "Project dependencies installed."
}

run_migrations() {
  say "Applying database migrations…"
  if UV_PROJECT_ENVIRONMENT=.venv "$UV" run --package papyrus-api alembic -c apps/api/alembic.ini upgrade head; then
    ok "Migrations applied."
  else
    warn "Migrations failed — ensure Postgres is reachable, then run 'make db-upgrade'."
  fi
}

# ---------------------------------------------------------------------
print_next_steps() {
  cat <<EOF

${c_grn}Setup complete.${c_rst}

Dev infrastructure runs in Docker (Postgres, Redis, LocalStack S3):
  ${c_dim}make infra-up${c_rst}      # start (also done by setup)
  ${c_dim}make infra-down${c_rst}    # stop (keeps data)
  ${c_dim}make infra-reset${c_rst}   # stop + wipe data volumes
  LocalStack S3: http://localhost:4566  (buckets auto-created: papyrus-uploads, papyrus-outputs)

Run app processes natively (each in its own terminal):
  ${c_dim}make api${c_rst}      # http://localhost:8000
  ${c_dim}make worker${c_rst}
  ${c_dim}make web${c_rst}      # http://localhost:5173

If \$HOME/.local/bin or \$HOME/.bun/bin are not on your PATH, add to ~/.bashrc / ~/.zshrc:
  ${c_dim}export PATH="\$HOME/.local/bin:\$HOME/.bun/bin:\$PATH"${c_rst}
EOF
}

# ---------------------------------------------------------------------
main() {
  say "Papyrus dev bootstrap"
  if ! confirm "This installs toolchains (uv, Python, Node, bun) and starts Docker infra. Continue?"; then
    err "Aborted."
    exit 1
  fi

  install_base_packages
  require_docker
  install_uv
  install_python
  install_node
  install_bun
  start_infra
  configure_env
  install_project_deps
  run_migrations
  print_next_steps
}

main "$@"
