#!/bin/bash

##############################################################################
# HiveControl OS Build Validation Script
# Validates all UI components, generates build manifest, reports status
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
SCREENS_DIR="$ROOT_DIR/screens"
MANIFEST_FILE="$ROOT_DIR/build-manifest.json"

# Counters
TOTAL_FILES=0
PASSED_CHECKS=0
FAILED_CHECKS=0

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

log_section() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
}

##############################################################################
# File Validation
##############################################################################

check_file_exists() {
    local filepath="$1"
    local name="${2:-$filepath}"

    if [ ! -f "$filepath" ]; then
        log_error "File not found: $name"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    log_success "File exists: $name"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
}

check_file_not_empty() {
    local filepath="$1"
    local name="${2:-$filepath}"

    if [ ! -f "$filepath" ]; then
        log_error "File not found: $name"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    local size=$(wc -c < "$filepath")
    if [ "$size" -eq 0 ]; then
        log_error "File is empty: $name (0 bytes)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi

    log_success "File valid: $name ($size bytes)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
}

get_file_size() {
    local filepath="$1"
    if [ -f "$filepath" ]; then
        wc -c < "$filepath"
    else
        echo 0
    fi
}

get_file_checksum() {
    local filepath="$1"
    if [ -f "$filepath" ]; then
        sha256sum "$filepath" | awk '{print $1}'
    else
        echo "N/A"
    fi
}

##############################################################################
# HTML Validation
##############################################################################

validate_html_basic() {
    local filepath="$1"
    local name="${2:-$filepath}"

    if [ ! -f "$filepath" ]; then
        return 1
    fi

    local content=$(cat "$filepath")

    # Check for HTML declaration
    if ! echo "$content" | grep -q "<!DOCTYPE\|<html"; then
        log_warning "Missing DOCTYPE or <html> tag: $name"
        return 1
    fi

    # Check for common issues
    local unclosed_divs=$(echo "$content" | grep -o "<div[^>]*>" | wc -l)
    local closed_divs=$(echo "$content" | grep -o "</div>" | wc -l)

    if [ "$unclosed_divs" -ne "$closed_divs" ]; then
        log_warning "Potential unclosed <div> tags in: $name"
        return 1
    fi

    # Check for common tag balance
    local unclosed_p=$(echo "$content" | grep -o "<p[^>]*>" | wc -l)
    local closed_p=$(echo "$content" | grep -o "</p>" | wc -l)

    if [ "$unclosed_p" -ne "$closed_p" ]; then
        log_warning "Potential unclosed <p> tags in: $name"
        return 1
    fi

    return 0
}

validate_screen_files() {
    log_section "Validating Screen HTML Files"

    local required_screens=(
        "dashboard.html"
        "monitor.html"
        "agents.html"
        "resources.html"
        "logs.html"
        "settings.html"
        "help.html"
        "about.html"
    )

    for screen in "${required_screens[@]}"; do
        local filepath="$SCREENS_DIR/$screen"
        if check_file_not_empty "$filepath" "screens/$screen"; then
            if validate_html_basic "$filepath" "$screen"; then
                log_success "HTML validation passed: $screen"
            else
                log_warning "HTML validation issues detected in: $screen"
            fi
        fi
        TOTAL_FILES=$((TOTAL_FILES + 1))
    done
}

validate_js_files() {
    log_section "Validating JavaScript Files"

    local required_js=(
        "$ROOT_DIR/ws-client.js"
    )

    for jsfile in "${required_js[@]}"; do
        check_file_not_empty "$jsfile" "$(basename "$jsfile")"
        TOTAL_FILES=$((TOTAL_FILES + 1))
    done
}

validate_index() {
    log_section "Validating Index File"

    check_file_not_empty "$ROOT_DIR/index.html" "index.html"
    validate_html_basic "$ROOT_DIR/index.html" "index.html"
    TOTAL_FILES=$((TOTAL_FILES + 1))
}

##############################################################################
# Build Manifest
##############################################################################

generate_manifest() {
    log_section "Generating Build Manifest"

    local manifest_data="{"
    manifest_data+='"timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",'
    manifest_data+='"files":['

    local first=true
    local file_count=0

    # Index file
    if [ -f "$ROOT_DIR/index.html" ]; then
        [ "$first" = false ] && manifest_data+=","
        manifest_data+='{"path":"index.html","size":'$(get_file_size "$ROOT_DIR/index.html")',"checksum":"'$(get_file_checksum "$ROOT_DIR/index.html")'"}'
        first=false
        file_count=$((file_count + 1))
    fi

    # Screen files
    if [ -d "$SCREENS_DIR" ]; then
        for screen in "$SCREENS_DIR"/*.html; do
            if [ -f "$screen" ]; then
                [ "$first" = false ] && manifest_data+=","
                local basename=$(basename "$screen")
                manifest_data+='{"path":"screens/'$basename'","size":'$(get_file_size "$screen")',"checksum":"'$(get_file_checksum "$screen")'"}'
                first=false
                file_count=$((file_count + 1))
            fi
        done
    fi

    # JavaScript files
    if [ -f "$ROOT_DIR/ws-client.js" ]; then
        [ "$first" = false ] && manifest_data+=","
        manifest_data+='{"path":"ws-client.js","size":'$(get_file_size "$ROOT_DIR/ws-client.js")',"checksum":"'$(get_file_checksum "$ROOT_DIR/ws-client.js")'"}'
        first=false
        file_count=$((file_count + 1))
    fi

    manifest_data+='],'
    manifest_data+='"fileCount":'$file_count','
    manifest_data+='"validationStatus":"'
    if [ $FAILED_CHECKS -eq 0 ]; then
        manifest_data+='PASS'
    else
        manifest_data+='FAIL'
    fi
    manifest_data+='"}'

    echo "$manifest_data" > "$MANIFEST_FILE"

    log_success "Manifest generated: $MANIFEST_FILE"
    log_info "Files included: $file_count"
}

##############################################################################
# File Size Report
##############################################################################

report_sizes() {
    log_section "File Size Report"

    echo "index.html: $(get_file_size "$ROOT_DIR/index.html") bytes"

    if [ -d "$SCREENS_DIR" ]; then
        for screen in "$SCREENS_DIR"/*.html; do
            if [ -f "$screen" ]; then
                echo "  $(basename "$screen"): $(get_file_size "$screen") bytes"
            fi
        done
    fi

    if [ -f "$ROOT_DIR/ws-client.js" ]; then
        echo "ws-client.js: $(get_file_size "$ROOT_DIR/ws-client.js") bytes"
    fi

    # Total size
    local total_size=0
    [ -f "$ROOT_DIR/index.html" ] && total_size=$((total_size + $(get_file_size "$ROOT_DIR/index.html")))
    [ -d "$SCREENS_DIR" ] && {
        for screen in "$SCREENS_DIR"/*.html; do
            [ -f "$screen" ] && total_size=$((total_size + $(get_file_size "$screen")))
        done
    }
    [ -f "$ROOT_DIR/ws-client.js" ] && total_size=$((total_size + $(get_file_size "$ROOT_DIR/ws-client.js")))

    echo ""
    echo "Total size: $total_size bytes ($(echo "scale=2; $total_size / 1024" | bc) KB)"
}

##############################################################################
# Summary & Exit
##############################################################################

print_summary() {
    log_section "Validation Summary"

    echo "Total checks: $TOTAL_FILES"
    echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
    echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
    echo ""

    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}Build validation: PASS${NC}"
        return 0
    else
        echo -e "${RED}Build validation: FAIL${NC}"
        return 1
    fi
}

##############################################################################
# Main
##############################################################################

main() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   HiveControl OS Build Validation      ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""

    validate_index
    validate_screen_files
    validate_js_files
    report_sizes
    generate_manifest
    print_summary

    local result=$?

    echo ""
    if [ $result -eq 0 ]; then
        echo -e "${GREEN}✓ Build is ready for deployment${NC}"
        exit 0
    else
        echo -e "${RED}✗ Build validation failed - review issues above${NC}"
        exit 1
    fi
}

main "$@"
