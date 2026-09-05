#!/bin/bash
# Compatibility entrypoint. Native installation has one implementation.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
echo "setup.sh now delegates to scripts/install.sh (native awenOps + awenAgent)."
echo "For Docker, follow docs/deployment-recovery.md."
exec bash "$SCRIPT_DIR/scripts/install.sh" "$@"
