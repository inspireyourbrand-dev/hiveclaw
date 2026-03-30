#!/bin/bash

##############################################################################
# HiveClaw Upstream Sync Script
# Automated sync with OpenClaw main, with merge conflict handling
# Logs all sync activities and verifies build after sync
##############################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
UPSTREAM_DIR="$ROOT_DIR/upstream"
LOG_DIR="$ROOT_DIR/.sync-logs"
LOG_FILE="$LOG_DIR/sync-$(date +%Y%m%d-%H%M%S).log"

# Configuration
MERGE_STRATEGY="${1:-merge}"  # 'merge' or 'rebase'
REMOTE="${2:-origin}"
BRANCH="${3:-main}"

##############################################################################
# Utility Functions
##############################################################################

log_info() {
    local msg="$1"
    echo -e "${BLUE}[INFO]${NC} $msg" | tee -a "$LOG_FILE"
}

log_success() {
    local msg="$1"
    echo -e "${GREEN}[✓]${NC} $msg" | tee -a "$LOG_FILE"
}

log_error() {
    local msg="$1"
    echo -e "${RED}[✗]${NC} $msg" | tee -a "$LOG_FILE"
}

log_warning() {
    local msg="$1"
    echo -e "${YELLOW}[!]${NC} $msg" | tee -a "$LOG_FILE"
}

log_section() {
    local msg="$1"
    echo "" | tee -a "$LOG_FILE"
    echo -e "${CYAN}═══════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}$msg${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}═══════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
}

die() {
    log_error "$1"
    echo "" | tee -a "$LOG_FILE"
    exit 1
}

##############################################################################
# Pre-Sync Checks
##############################################################################

check_environment() {
    log_section "Environment Check"

    if [ ! -d "$UPSTREAM_DIR/.git" ]; then
        die "OpenClaw not found at $UPSTREAM_DIR. Run install.sh first."
    fi

    if ! command -v git &> /dev/null; then
        die "Git not found. Please install Git."
    fi

    log_success "Git found"

    # Validate merge strategy
    if [ "$MERGE_STRATEGY" != "merge" ] && [ "$MERGE_STRATEGY" != "rebase" ]; then
        die "Invalid merge strategy: $MERGE_STRATEGY. Use 'merge' or 'rebase'."
    fi

    log_success "Configuration valid (strategy: $MERGE_STRATEGY)"
}

check_clean_state() {
    log_section "Checking Working Tree"

    cd "$UPSTREAM_DIR"

    local status=$(git status --porcelain)
    if [ -n "$status" ]; then
        log_warning "Uncommitted changes detected in $UPSTREAM_DIR:"
        echo "$status" | tee -a "$LOG_FILE"
        log_error "Please commit or stash changes before syncing"
        die "Working tree is dirty"
    fi

    log_success "Working tree is clean"
    cd - > /dev/null
}

##############################################################################
# Fetch & Diff
##############################################################################

fetch_upstream() {
    log_section "Fetching Upstream Changes"

    cd "$UPSTREAM_DIR"

    log_info "Fetching from $REMOTE/$BRANCH..."
    git fetch "$REMOTE" "$BRANCH" 2>&1 | tee -a "$LOG_FILE" || die "Fetch failed"

    log_success "Fetch completed"
    cd - > /dev/null
}

show_changes() {
    log_section "Changes Since Last Sync"

    cd "$UPSTREAM_DIR"

    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    log_info "Current branch: $current_branch"

    log_info "Commits to be merged/rebased:"
    git log --oneline "$current_branch".."$REMOTE/$BRANCH" 2>&1 | tee -a "$LOG_FILE" || true

    echo "" | tee -a "$LOG_FILE"
    log_info "Files changed:"
    git diff --stat "$current_branch" "$REMOTE/$BRANCH" 2>&1 | tee -a "$LOG_FILE" || true

    cd - > /dev/null
}

##############################################################################
# Sync Strategy
##############################################################################

perform_merge() {
    log_section "Performing Merge"

    cd "$UPSTREAM_DIR"

    log_info "Merging $REMOTE/$BRANCH into $(git rev-parse --abbrev-ref HEAD)..."

    if ! git merge "$REMOTE/$BRANCH" >> "$LOG_FILE" 2>&1; then
        log_error "Merge conflict detected!"
        echo "" | tee -a "$LOG_FILE"
        log_warning "Conflicts found. Showing status:"
        git status | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
        log_error "Merge aborted. Please resolve conflicts manually:"
        log_info "  1. Review conflicts: git diff"
        log_info "  2. Resolve conflicts in your editor"
        log_info "  3. Stage resolved files: git add <files>"
        log_info "  4. Complete merge: git commit"
        die "Merge conflict - manual intervention required"
    fi

    log_success "Merge completed successfully"
    cd - > /dev/null
}

perform_rebase() {
    log_section "Performing Rebase"

    cd "$UPSTREAM_DIR"

    log_info "Rebasing onto $REMOTE/$BRANCH..."

    if ! git rebase "$REMOTE/$BRANCH" >> "$LOG_FILE" 2>&1; then
        log_error "Rebase conflict detected!"
        echo "" | tee -a "$LOG_FILE"
        log_warning "Conflicts found. Showing status:"
        git status | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
        log_error "Rebase paused. Please resolve conflicts manually:"
        log_info "  1. Review conflicts: git diff"
        log_info "  2. Resolve conflicts in your editor"
        log_info "  3. Stage resolved files: git add <files>"
        log_info "  4. Continue rebase: git rebase --continue"
        log_info "  5. Or abort: git rebase --abort"
        die "Rebase conflict - manual intervention required"
    fi

    log_success "Rebase completed successfully"
    cd - > /dev/null
}

##############################################################################
# Post-Sync Verification
##############################################################################

verify_sync() {
    log_section "Build Verification"

    cd "$UPSTREAM_DIR"

    log_info "Running build verification..."

    if [ ! -f "package.json" ]; then
        log_warning "package.json not found - skipping build verification"
        return 0
    fi

    # Try to run build or test
    if grep -q '"build"' package.json; then
        log_info "Running build script..."
        if npm run build >> "$LOG_FILE" 2>&1; then
            log_success "Build verification passed"
        else
            log_warning "Build had issues (see log for details)"
            log_info "Sync completed but build verification failed"
            return 1
        fi
    else
        log_info "No build script found in package.json"
    fi

    cd - > /dev/null
    return 0
}

##############################################################################
# Sync Report
##############################################################################

generate_sync_report() {
    log_section "Sync Report"

    cd "$UPSTREAM_DIR"

    local sync_date=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    local commit=$(git rev-parse --short HEAD)
    local branch=$(git rev-parse --abbrev-ref HEAD)
    local remote_commit=$(git rev-parse --short "$REMOTE/$BRANCH")

    log_info "Sync completed successfully!"
    echo "" | tee -a "$LOG_FILE"
    echo "  Date:           $sync_date" | tee -a "$LOG_FILE"
    echo "  Current branch: $branch" | tee -a "$LOG_FILE"
    echo "  Local commit:   $commit" | tee -a "$LOG_FILE"
    echo "  Remote commit:  $remote_commit" | tee -a "$LOG_FILE"
    echo "  Strategy used:  $MERGE_STRATEGY" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    cd - > /dev/null
}

##############################################################################
# Logging
##############################################################################

setup_logging() {
    mkdir -p "$LOG_DIR"

    {
        echo "HiveClaw Upstream Sync Log"
        echo "=========================="
        echo "Started: $(date)"
        echo "Merge Strategy: $MERGE_STRATEGY"
        echo "Remote: $REMOTE/$BRANCH"
        echo ""
    } > "$LOG_FILE"

    log_info "Logging to: $LOG_FILE"
}

##############################################################################
# Main Sync Function
##############################################################################

main() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║    HiveClaw Upstream Sync Script       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""

    setup_logging
    echo ""

    check_environment
    check_clean_state
    fetch_upstream
    show_changes
    echo ""

    # Confirm before syncing
    echo -e "${YELLOW}Ready to sync. Continue? (yes/no)${NC}"
    read -r confirm
    if [ "$confirm" != "yes" ] && [ "$confirm" != "y" ]; then
        log_info "Sync cancelled by user"
        exit 0
    fi

    echo ""

    if [ "$MERGE_STRATEGY" = "rebase" ]; then
        perform_rebase
    else
        perform_merge
    fi

    if verify_sync; then
        generate_sync_report
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║      Sync Completed Successfully!      ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
        echo ""
        log_info "Full log saved to: $LOG_FILE"
    else
        echo ""
        log_warning "Sync completed with build verification issues"
        log_info "Review log for details: $LOG_FILE"
    fi
}

main "$@"
