#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

NODE_MAJOR=24
PY_VERSION=3.13
PG_MAJOR=17
REDIS_MAJOR=7
MINIO_DIR="${MINIO_DIR:-$HOME/.local/share/minio}"
MINIO_BIN="${MINIO_BIN:-$HOME/.local/bin/minio}"
MC_BIN="${MC_BIN:-$HOME/.local/bin/mc}"

DB_USER=papyrus
DB_PASSWORD=papyrus
DB_NAME=papyrus
S3_USER=papyrus
S3_PASSWORD=papyrus-secret

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
if [[ "$OS" == "Linux" ]]; then
  if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    DISTRO="${ID:-unknown}"
  fi
  case "$DISTRO" in
    ubuntu|debian|pop|linuxmint) PKG=apt ;;
    fedora|rhel|rocky|almalinux) PKG=dnf ;;
    arch|manjaro|endeavouros)    PKG=pacman ;;
    *)                           PKG="" ;;
  esac
elif [[ "$OS" == "Darwin" ]]; then
  DISTRO=macos
  PKG=brew
fi

mkdir -p "$HOME/.local/bin"

PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '/\.pyenv/shims' | paste -sd: -)"
export PATH="$HOME/.local/bin:$PATH"

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
  err "Unsupported platform. Install Postgres $PG_MAJOR, Redis $REDIS_MAJOR, Node $NODE_MAJOR, uv, MinIO manually, then re-run with SKIP_SYSTEM=1."
  [[ "${SKIP_SYSTEM:-0}" == "1" ]] || exit 1
fi

# ---------------------------------------------------------------------
install_base_packages() {
  [[ "${SKIP_SYSTEM:-0}" == "1" ]] && { warn "SKIP_SYSTEM=1 — skipping base package install."; return; }

  have curl || { err "curl is required to bootstrap. Install it first (e.g. 'sudo apt install curl') and re-run."; exit 1; }

  say "Installing base build tools…"
  case "$PKG" in
    apt)
      sudo_run apt-get update -y || warn "apt-get update reported errors; continuing."
      sudo_run apt-get install -y --no-install-recommends \
        build-essential ca-certificates gnupg lsb-release pkg-config \
        libssl-dev libffi-dev git
      ;;
    dnf)
      sudo_run dnf install -y gcc gcc-c++ make ca-certificates gnupg pkgconf \
        openssl-devel libffi-devel git
      ;;
    pacman)
      sudo_run pacman -Syu --noconfirm --needed base-devel gnupg openssl libffi git
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
install_uv() {
  if [[ -x "$UV" ]] && "$UV" --version >/dev/null 2>&1; then
    ok "uv already installed at $UV: $("$UV" --version)"
    return
  fi
  say "Installing uv to $HOME/.local/bin…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  if [[ ! -x "$UV" ]] || ! "$UV" --version >/dev/null 2>&1; then
    err "uv install failed — expected $UV to be a working binary."
    err "If pyenv has a stale 'uv' shim, remove it: pyenv uninstall a python that has uv, or rm \$(pyenv prefix 3.10.19)/bin/uv"
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
install_node_pnpm() {
  local current=""
  if have node; then current="$(node -v)"; fi
  if [[ "$current" =~ ^v$NODE_MAJOR\. ]]; then
    ok "Node $current already installed."
  else
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
  fi

  if have corepack; then
    say "Enabling pnpm via corepack…"
    sudo_run corepack enable || corepack enable || true
    corepack prepare pnpm@latest --activate
    ok "pnpm: $(pnpm --version)"
  elif have pnpm; then
    ok "pnpm already installed: $(pnpm --version)"
  else
    warn "Neither corepack nor pnpm found — installing pnpm globally via npm."
    sudo_run npm install -g pnpm
  fi
}

# ---------------------------------------------------------------------
install_postgres() {
  if have psql && psql --version | grep -qE "psql \(PostgreSQL\) ${PG_MAJOR}\."; then
    ok "PostgreSQL $PG_MAJOR already installed."
  else
    [[ "${SKIP_SYSTEM:-0}" == "1" ]] && { warn "SKIP_SYSTEM=1 — skipping Postgres install."; return; }
    say "Installing PostgreSQL $PG_MAJOR…"
    case "$PKG" in
      apt)
        if sudo_run apt-get install -y "postgresql-${PG_MAJOR}" "postgresql-client-${PG_MAJOR}"; then
          ok "Installed postgresql-${PG_MAJOR} from system archive."
        else
          warn "Stock postgresql-${PG_MAJOR} unavailable — adding PGDG repo."
          sudo_run install -d /usr/share/postgresql-common/pgdg
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
            | sudo_run tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
          local codename; codename="$(lsb_release -cs)"
          case "$codename" in
            questing|plucky|oracular|mantic|lunar|kinetic) codename=noble ;;
          esac
          echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
            | sudo_run tee /etc/apt/sources.list.d/pgdg.list >/dev/null
          sudo_run apt-get update
          sudo_run apt-get install -y "postgresql-${PG_MAJOR}" "postgresql-client-${PG_MAJOR}"
        fi
        ;;
      dnf)
        sudo_run dnf install -y "https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %rhel)-x86_64/pgdg-redhat-repo-latest.noarch.rpm" || true
        sudo_run dnf -qy module disable postgresql || true
        sudo_run dnf install -y "postgresql${PG_MAJOR}-server" "postgresql${PG_MAJOR}"
        sudo_run "/usr/pgsql-${PG_MAJOR}/bin/postgresql-${PG_MAJOR}-setup" initdb || true
        ;;
      pacman)
        sudo_run pacman -S --noconfirm --needed postgresql
        if [[ ! -d /var/lib/postgres/data ]]; then
          sudo_run -u postgres initdb -D /var/lib/postgres/data
        fi
        ;;
      brew)
        brew install "postgresql@${PG_MAJOR}"
        brew services start "postgresql@${PG_MAJOR}"
        brew link --overwrite --force "postgresql@${PG_MAJOR}" || true
        ;;
    esac
  fi

  case "$PKG" in
    apt)
      sudo_run systemctl enable --now postgresql || true
      ;;
    dnf|pacman)
      sudo_run systemctl enable --now postgresql || true
      ;;
    brew)
      brew services start "postgresql@${PG_MAJOR}" || true
      ;;
  esac

  say "Provisioning Postgres role + database…"
  local PSQL_SUDO="sudo_run -u postgres"
  if [[ "$PKG" == "brew" ]]; then PSQL_SUDO=""; fi

  if $PSQL_SUDO psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null | grep -q 1; then
    ok "Role ${DB_USER} exists."
  else
    $PSQL_SUDO psql -c "CREATE ROLE ${DB_USER} LOGIN SUPERUSER PASSWORD '${DB_PASSWORD}';"
    ok "Role ${DB_USER} created."
  fi
  if $PSQL_SUDO psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1; then
    ok "Database ${DB_NAME} exists."
  else
    $PSQL_SUDO psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    ok "Database ${DB_NAME} created."
  fi
}

# ---------------------------------------------------------------------
install_redis() {
  if have redis-server; then
    ok "Redis already installed: $(redis-server --version | awk '{print $3}')"
  else
    [[ "${SKIP_SYSTEM:-0}" == "1" ]] && { warn "SKIP_SYSTEM=1 — skipping Redis install."; return; }
    say "Installing Redis $REDIS_MAJOR…"
    case "$PKG" in
      apt)    sudo_run apt-get install -y redis-server ;;
      dnf)    sudo_run dnf install -y redis ;;
      pacman) sudo_run pacman -S --noconfirm --needed redis ;;
      brew)   brew install redis ;;
    esac
  fi
  case "$PKG" in
    apt|dnf|pacman) sudo_run systemctl enable --now redis-server 2>/dev/null \
                    || sudo_run systemctl enable --now redis 2>/dev/null \
                    || true ;;
    brew)           brew services start redis || true ;;
  esac
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis is up."
  else
    warn "Redis service did not respond to PING. Start it manually if needed."
  fi
}

# ---------------------------------------------------------------------
install_minio() {
  local arch
  case "$(uname -m)" in
    x86_64|amd64)   arch=amd64 ;;
    aarch64|arm64)  arch=arm64 ;;
    *) err "Unsupported arch for MinIO: $(uname -m)"; return 1 ;;
  esac
  local plat
  if [[ "$OS" == "Darwin" ]]; then plat=darwin; else plat=linux; fi

  if [[ -x "$MINIO_BIN" ]]; then
    ok "MinIO already installed at $MINIO_BIN"
  else
    say "Downloading MinIO server…"
    curl -fsSLo "$MINIO_BIN" "https://dl.min.io/server/minio/release/${plat}-${arch}/minio"
    chmod +x "$MINIO_BIN"
    ok "MinIO installed at $MINIO_BIN"
  fi
  if [[ -x "$MC_BIN" ]]; then
    ok "MinIO client (mc) already installed."
  else
    say "Downloading MinIO client (mc)…"
    curl -fsSLo "$MC_BIN" "https://dl.min.io/client/mc/release/${plat}-${arch}/mc"
    chmod +x "$MC_BIN"
    ok "mc installed at $MC_BIN"
  fi

  mkdir -p "$MINIO_DIR"
  ok "MinIO data dir ready at $MINIO_DIR"

  cat > "$ROOT/scripts/run_minio.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export MINIO_ROOT_USER="${S3_USER}"
export MINIO_ROOT_PASSWORD="${S3_PASSWORD}"
exec "${MINIO_BIN}" server "${MINIO_DIR}" --console-address ":9001"
EOF
  chmod +x "$ROOT/scripts/run_minio.sh"
  ok "Wrote scripts/run_minio.sh — start MinIO with:  bash scripts/run_minio.sh"
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
  say "Installing project dependencies (uv sync + pnpm install)…"
  UV_PROJECT_ENVIRONMENT=.venv "$UV" venv .venv --python "$PY_VERSION"
  UV_PROJECT_ENVIRONMENT=.venv "$UV" sync --all-packages --all-groups
  pnpm install
  ok "Project dependencies installed."
}

run_migrations() {
  if redis-cli ping 2>/dev/null | grep -q PONG && pg_isready -h localhost -p 5432 -U "$DB_USER" >/dev/null 2>&1; then
    say "Applying database migrations…"
    UV_PROJECT_ENVIRONMENT=.venv "$UV" run --package papyrus-api alembic -c apps/api/alembic.ini upgrade head
    ok "Migrations applied."
  else
    warn "Skipping migrations — Postgres or Redis not yet reachable. Run 'make db-upgrade' once they are."
  fi
}

# ---------------------------------------------------------------------
print_next_steps() {
  cat <<EOF

${c_grn}Setup complete.${c_rst}

Start MinIO (in its own terminal):
  ${c_dim}bash scripts/run_minio.sh${c_rst}
  console: http://localhost:9001  (user: ${S3_USER} / pass: ${S3_PASSWORD})

Initialize buckets (once MinIO is running):
  ${c_dim}${MC_BIN} alias set local http://localhost:9000 ${S3_USER} ${S3_PASSWORD}${c_rst}
  ${c_dim}${MC_BIN} mb -p local/papyrus-uploads local/papyrus-outputs${c_rst}

Run app processes (each in its own terminal):
  ${c_dim}make api${c_rst}      # http://localhost:8000
  ${c_dim}make worker${c_rst}
  ${c_dim}make web${c_rst}      # http://localhost:5173

If $HOME/.local/bin is not on your PATH (or pyenv shims sit ahead of it), add to ~/.bashrc / ~/.zshrc — AFTER the pyenv init lines — so the real uv wins over any stale pyenv shim:
  ${c_dim}export PATH="\$HOME/.local/bin:\$PATH"${c_rst}

The Makefile already prefers \$HOME/.local/bin/uv when present, so 'make api' / 'make web' will work even with pyenv active.
EOF
}

# ---------------------------------------------------------------------
main() {
  say "Papyrus dev bootstrap"
  if ! confirm "This will install/configure system packages (Postgres, Redis, Node) using sudo. Continue?"; then
    err "Aborted."
    exit 1
  fi

  install_base_packages
  install_uv
  install_python
  install_node_pnpm
  install_postgres
  install_redis
  install_minio
  configure_env
  install_project_deps
  run_migrations
  print_next_steps
}

main "$@"
