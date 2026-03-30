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
SCREENS_DIR="$ROOT_DIR/hivecontrol/screens"
LIB_DIR="$ROOT_DIR/hivecontrol/lib"
INDEX_FILE="$ROOT_DIR/hivecontrol/index.html"
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
    echo -e "${GREEN}[+]${NC} $1"
}

log_error() {
    echo -e "${RED}[x]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${CYAN}=======================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}=======================================${NC}"
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

    return 0
}

validate_screen_files() {
    log_section "Validating Screen HTML Files"

    local required_screens=(
        "dashboard.html"
        "tasks.html"
        "calendar.html"
        "memory.html"
        "projects.html"
        "documents.html"
        "team.html"
        "office.html"
        "workflow.html"
    )

    for screen in "${required_screens[@]}"; do
        local filepath="$SCREENS_DIR/$screen"
        if check_file_not_empty "$filepath" "hivecontrol/screens/$screen"; then
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
        "$LIB_DIR/ws-client.js"
        "$LIB_DIR/hive-bus.js"
    )

    for jsfile in "${required_js[@]}"; do
        check_file_not_empty "$jsfile" "hivecontrol/lib/$(basename "$jsfile")"
        TOTAL_FILES=$((TOTAL_FILES + 1))
    done
}

validate_index() {
    log_section "Validating Index File"

    check_file_not_empty "$INDEX_FILE" "hivecontrol/index.html"
    validate_html_basic "$INDEX_FILE" "hivecontrol/index.html"
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
    if [ -f "$INDEX_FILE" ]; then
        [ "$first" = false ] && manifest_data+=","
        manifest_data+='{"path":"hivecontrol/index.html","size":'$(get_file_size "$INDEX_FILE")',"checksum":"'$(get_file_checksum "$INDEX_FILE")'"}'
        first=false
        file_count=$((file_count + 1))
    fi

    # Screen files
    if [ -d "$SCREENS_DIR" ]; then
        for screen in "$SCREENS_DIR"/*.html; do
            if [ -f "$screen" ]; then
                [ "$first" = false ] && manifest_data+=","
                local basename=$(basename "$screen")
                manifest_data+='{"path":"hivecontrol/screens/'$basename'","size":'$(get_file_size "$screen")',"checksum":"'$(get_file_checksum "$screen")'"}'
                first=false
                file_count=$((file_count + 1))
            fi
        done
    fi

    # JavaScript files
    if [ -d "$LIB_DIR" ]; then
        for jsfile in "$LIB_DIR"/*.js; do
            if [ -f "$jsfile" ]; then
                [ "$first" = false ] && manifest_data+=","
                local basename=$(basename "$jsfile")
                manifest_data+='{"path":"hivecontrol/lib/'$basename'","size":'$(get_file_size "$jsfile")',"checksum":"'$(get_file_checksum "$jsfile")'"}'
                first=false
                file_count=$((file_count + 1))
            fi
        done
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

    echo "hivecontrol/index.html: $(get_file_size "$INDEX_FILE") bytes"

    if [ -d "$SCREENS_DIR" ]; then
        for screen in "$SCREENS_DIR"/*.html; do
            if [ -f "$screen" ]; then
                echo "  $(basename "$screen"): $(get_file_size "$screen") bytes"
            fi
        done
    fi

    if [ -d "$LIB_DIR" ]; then
        for jsfile in "$LIB_DIR"/*.js; do
            if [ -f "$jsfile" ]; then
                echo "  $(basename "$jsfile"): $(get_file_size "$jsfile") bytes"
            fi
        done
    fi

    # Total size
    local total_size=0
    [ -f "$INDEX_FILE" ] && total_size=$((total_size + $(get_file_size "$INDEX_FILE")))
    [ -d "$SCREENS_DIR" ] && {
        for screen in "$SCREENS_DIR"/*.html; do
            [ -f "$screen" ] && total_size=$((total_size + $(get_file_size "$screen")))
        done
    }
    [ -d "$LIB_DIR" ] && {
        for jsfile in "$LIB_DIR"/*.js; do
            [ -f "$jsfile" ] && total_size=$((total_size + $(get_file_size "$jsfile")))
        done
    }

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
    echo -e "${BLUE}+========================================+${NC}"
    echo -e "${BLUE}|   HiveControl OS Build Validation      |${NC}"
    echo -e "${BLUE}+========================================+${NC}"
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
        echo -e "${GREEN}Build is ready for deployment${NC}"
        exit 0
    else
        echo -e "${RED}Build validation failed - review issues above${NC}"
        exit 1
    fi
}

main "$@"
