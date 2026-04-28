#!/usr/bin/env bash
set -euo pipefail

# Example wrapper for installs whose qmd CLI shape differs from QMD Recall's default.
# Point plugin config `qmdCommand` at this file if needed.

exec qmd "$@"
