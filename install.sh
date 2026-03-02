#!/bin/sh
set -e

REPO="Muriel-Gasparini/dya"
INSTALL_DIR="$HOME/.local/bin"

# Colors (only if terminal supports)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

error() {
  printf "${RED}Erro: %s${NC}\n" "$1" >&2
  exit 1
}

warn() {
  printf "${YELLOW}AVISO: %s${NC}\n" "$1"
}

info() {
  printf "%s\n" "$1"
}

# Check for curl
if ! command -v curl >/dev/null 2>&1; then
  error "curl nao encontrado. Instale curl e tente novamente."
fi

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  linux)  OS="linux" ;;
  darwin) OS="darwin" ;;
  *)      error "Sistema operacional nao suportado: $OS. Apenas Linux e macOS sao suportados." ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)       error "Arquitetura nao suportada: $ARCH" ;;
esac

# Get latest version
info "Verificando versao mais recente..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')

if [ -z "$LATEST" ]; then
  error "Nao foi possivel determinar a versao mais recente. Verifique sua conexao."
fi

ASSET="dya-${OS}-${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/v${LATEST}/${ASSET}"

# Download and install
info "Baixando dya v${LATEST} para ${OS}-${ARCH}..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if ! curl -fsSL "$URL" -o "$TMP/$ASSET"; then
  error "Falha ao baixar $URL. Verifique se a versao v${LATEST} tem binario para ${OS}-${ARCH}."
fi

tar xzf "$TMP/$ASSET" -C "$TMP"

BIN_NAME="dya-${OS}-${ARCH}"
mkdir -p "$INSTALL_DIR"
mv "$TMP/$BIN_NAME" "$INSTALL_DIR/dya"
chmod +x "$INSTALL_DIR/dya"

# Check PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    warn "$INSTALL_DIR nao esta no PATH. Adicione ao seu ~/.bashrc ou ~/.zshrc:"
    info "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

printf "${GREEN}dya v${LATEST} instalado com sucesso em ${INSTALL_DIR}/dya${NC}\n"
