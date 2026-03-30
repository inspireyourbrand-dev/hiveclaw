#!/bin/bash

##############################################################################
# HiveClaw Installation Script
# One-command installer for HiveClaw + OpenClaw integration
# Idempotent, production-quality, colored output
##############################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
UPSTREAM_DIR="$ROOT_DIR/upstream"
GATEWAY_DIR="$ROOT_DIR/gateway/serve"

##############################################################################
# Utility Functions
##############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

die() {
    log_error "$1"
    exit 1
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

get_version() {
    "$1" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

##############################################################################
# Prerequisite Checks
##############################################################################

check_prerequisites() {
    log_info "Checking prerequisites..."
    local failed=0

    # Node.js >= 22
    if ! check_command node; then
        log_error "Node.js not found. Please install Node.js >= 22.0.0"
        failed=1
    else
        local node_version=$(node --version | cut -d'v' -f2)
        local node_major=$(echo $node_version | cut -d'.' -f1)
        if [ "$node_major" -lt 22 ]; then
            log_error "Node.js version $node_version detected, but >= 22.0.0 required"
            failed=1
        else
            log_success "Node.js v$node_version"
        fi
    fi

    # Git
    if ! check_command git; then
        log_error "Git not found. Please install Git"
        failed=1
    else
        local git_version=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        log_success "Git $git_version"
    fi

    # pnpm (optional)
    if ! check_command pnpm; then
        log_warning "pnpm not found (optional). npm will be used instead"
        log_info "To use pnpm: npm install -g pnpm"
    else
        local pnpm_version=$(pnpm --version)
        log_success "pnpm v$pnpm_version"
    fi

    if [ $failed -eq 1 ]; then
        die "Prerequisites check failed"
    fi

    log_success "All prerequisites satisfied"
}

##############################################################################
# OpenClaw Integration
##############################################################################

setup_openclaw() {
    log_info "Setting up OpenClaw upstream..."

    if [ -d "$UPSTREAM_DIR/.git" ]; then
        log_success "OpenClaw already cloned at $UPSTREAM_DIR"
        log_info "Pulling latest changes..."
        (cd "$UPSTREAM_DIR" && git pull origin main 2>/dev/null || true)
    else
        log_info "Cloning OpenClaw into $UPSTREAM_DIR..."
        mkdir -p "$ROOT_DIR"
        git clone --depth 1 https://github.com/hivepowered/openclaw.git "$UPSTREAM_DIR" || \
            die "Failed to clone OpenClaw"
        log_success "OpenClaw cloned"
    fi

    # Install OpenClaw dependencies
    log_info "Installing OpenClaw dependencies..."
    if command -v pnpm &> /dev/null; then
        (cd "$UPSTREAM_DIR" && pnpm install) || die "Failed to install OpenClaw dependencies"
    else
        (cd "$UPSTREAM_DIR" && npm install) || die "Failed to install OpenClaw dependencies"
    fi
    log_success "OpenClaw dependencies installed"
}

##############################################################################
# Gateway Setup
##############################################################################

setup_gateway() {
    log_info "Setting up gateway serve directory..."

    mkdir -p "$GATEWAY_DIR"

    # Copy HiveControl OS files to gateway
    if [ -d "$ROOT_DIR/hivecontrol/screens" ]; then
        log_info "Copying HiveControl screens..."
        mkdir -p "$GATEWAY_DIR/screens"
        cp -r "$ROOT_DIR/hivecontrol/screens"/* "$GATEWAY_DIR/screens/" 2>/dev/null || true
        log_success "Screens copied"
    fi

    if [ -f "$ROOT_DIR/hivecontrol/index.html" ]; then
        log_info "Copying index.html..."
        cp "$ROOT_DIR/hivecontrol/index.html" "$GATEWAY_DIR/"
        log_success "index.html copied"
    fi

    if [ -f "$ROOT_DIR/hivecontrol/lib/ws-client.js" ]; then
        log_info "Copying ws-client.js..."
        mkdir -p "$GATEWAY_DIR/lib"
        cp "$ROOT_DIR/hivecontrol/lib/ws-client.js" "$GATEWAY_DIR/lib/"
        log_success "ws-client.js copied"
    fi

    # Copy other lib files
    if [ -d "$ROOT_DIR/hivecontrol/lib" ]; then
        log_info "Copying lib directory..."
        mkdir -p "$GATEWAY_DIR/lib"
        cp -r "$ROOT_DIR/hivecontrol/lib"/* "$GATEWAY_DIR/lib/" 2>/dev/null || true
        log_success "Lib files copied"
    fi

    if [ -d "$ROOT_DIR/branding" ]; then
        log_info "Copying branding assets..."
        mkdir -p "$GATEWAY_DIR/branding"
        cp -r "$ROOT_DIR/branding"/* "$GATEWAY_DIR/branding/" 2>/dev/null || true
        log_success "Branding assets copied"
    fi
}

##############################################################################
# Configuration
##############################################################################

setup_config() {
    log_info "Setting up configuration..."

    local config_file="$ROOT_DIR/hiveclaw.config.json"

    if [ -f "$config_file" ]; then
        log_success "Config already exists at $config_file"
        return 0
    fi

    log_info "Creating default hiveclaw.config.json..."
    cat > "$config_file" << 'EOF'
{
  "version": "0.1.0",
  "gateway": {
    "host": "localhost",
    "port": 3000,
    "wsPort": 3001,
    "serve": "./gateway/serve"
  },
  "agents": {
    "workspace": "./agents/workspace",
    "defaultConfig": {
      "timeout": 30000,
      "retries": 3,
      "logLevel": "info"
    }
  },
  "sync": {
    "upstreamRemote": "origin",
    "upstreamBranch": "main",
    "mergeStrategy": "merge",
    "autoVerify": true
  },
  "features": {
    "enableTypeScript": true,
    "enableESLint": false,
    "enablePrettier": false
  }
}
EOF

    log_success "Default config created"
}

##############################################################################
# Workspace Setup
##############################################################################

setup_workspace() {
    log_info "Setting up agent workspace directories..."

    local workspace_dir="$ROOT_DIR/agents/workspace"
    mkdir -p "$workspace_dir"

    # Create standard agent workspace structure
    mkdir -p "$workspace_dir/active"
    mkdir -p "$workspace_dir/archived"
    mkdir -p "$workspace_dir/templates"
    mkdir -p "$workspace_dir/logs"

    # Create template agent directory structure
    mkdir -p "$workspace_dir/templates/base-agent"
    mkdir -p "$workspace_dir/templates/base-agent/src"
    mkdir -p "$workspace_dir/templates/base-agent/config"

    log_success "Agent workspace structure created"
}

##############################################################################
# Build & Verification
##############################################################################

verify_build() {
    log_info "Verifying build integrity..."

    local failures=0

    # Check OpenClaw
    if [ ! -d "$UPSTREAM_DIR" ]; then
        log_warning "OpenClaw directory not found"
        failures=$((failures + 1))
    else
        log_success "OpenClaw directory present"
    fi

    # Check gateway serve directory
    if [ ! -d "$GATEWAY_DIR" ]; then
        log_warning "Gateway serve directory not found"
        failures=$((failures + 1))
    else
        log_success "Gateway serve directory present"
    fi

    # Check config
    if [ ! -f "$ROOT_DIR/hiveclaw.config.json" ]; then
        log_warning "Config file not found"
        failures=$((failures + 1))
    else
        log_success "Config file present"
    fi

    # Check workspace
    if [ ! -d "$ROOT_DIR/agents/workspace" ]; then
        log_warning "Agent workspace not found"
        failures=$((failures + 1))
    else
        log_success "Agent workspace present"
    fi

    return $failures
}

##############################################################################
# Main Installation
##############################################################################

main() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║      HiveClaw Installation Script       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    echo ""

    setup_openclaw
    echo ""

    setup_gateway
    echo ""

    setup_config
    echo ""

    setup_workspace
    echo ""

    if verify_build; then
        log_success "Build verification passed"
    else
        log_warning "Some build checks had warnings"
    fi

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   HiveClaw Installation Complete!     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review configuration: $ROOT_DIR/hiveclaw.config.json"
    echo "  2. Build OpenClaw:      cd $UPSTREAM_DIR && npm run build"
    echo "  3. Start gateway:       cd $UPSTREAM_DIR && npm run start"
    echo "  4. Add agents:          Place agent configs in $ROOT_DIR/agents/workspace/active"
    echo ""
}

main "$@"
