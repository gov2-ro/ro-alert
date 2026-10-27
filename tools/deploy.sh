#!/usr/bin/env bash
# Copy the static app to a target folder, on this machine or on a remote host.
#
# Usage: tools/deploy.sh [--env FILE] [--dry-run]
#
# The env file (default: .env at the repo root) sets:
#   DEPLOY_PATH      Target folder. Required. The script creates it when it is missing.
#                    "~/x" is x in the home folder of the target (local or remote).
#   DEPLOY_HOST      SSH destination, for example "deploy@vps.example.ro". Empty: copy locally.
#   DEPLOY_PORT      SSH port. Optional; default 22.
#   DEPLOY_DELETE    "1" removes stale files inside the copied folders (css/, js/, vendor/).
#                    Files outside those folders are never removed. Optional; default 0.
#
# The script reads the file as plain KEY=VALUE lines; it does not run it as shell code.
#
# The script copies only the files that the page loads: index.html, css/, js/, vendor/ and
# the three data bundles. It refuses to copy when one of these files has uncommitted
# changes, so that the target always matches a commit. DEPLOY_ALLOW_DIRTY=1 skips that check.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_FILE="$2"; shift 2 ;;
    --dry-run|-n) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "deploy: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "deploy: env file not found: $ENV_FILE (copy .env.example to .env)" >&2
  exit 2
fi
# Read KEY=VALUE lines as plain text. The shell does not evaluate the file, so a leading
# "~" stays literal and refers to the home folder on the target, not on this machine.
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"; val="${line#*=}"
  key="${key//[[:space:]]/}"
  case "$val" in \"*\") val="${val:1:${#val}-2}" ;; \'*\') val="${val:1:${#val}-2}" ;; esac
  case "$key" in
    DEPLOY_PATH|DEPLOY_HOST|DEPLOY_PORT|DEPLOY_DELETE|DEPLOY_ALLOW_DIRTY) printf -v "$key" '%s' "$val" ;;
    *) echo "deploy: ignored unknown key in $ENV_FILE: $key" >&2 ;;
  esac
done < "$ENV_FILE"

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_DELETE="${DEPLOY_DELETE:-0}"
DEPLOY_PATH="${DEPLOY_PATH:-}"

case "$DEPLOY_PATH" in
  ""|"/"|"~"|"~/"|"."|"./")
    echo "deploy: DEPLOY_PATH is empty or unsafe: '$DEPLOY_PATH'" >&2; exit 2 ;;
esac
DEPLOY_PATH="${DEPLOY_PATH%/}"
# "~/x" means x in the home folder of the target. Locally that is $HOME/x. Over SSH, a path
# without a leading "/" is relative to the remote home folder, for both ssh and rsync.
case "$DEPLOY_PATH" in
  "~/"*) if [ -z "$DEPLOY_HOST" ]; then DEPLOY_PATH="$HOME/${DEPLOY_PATH#\~/}"; else DEPLOY_PATH="${DEPLOY_PATH#\~/}"; fi ;;
esac

FILES=(index.html css/ js/ vendor/ data/alerts.js data/meta.js data/geo.js)

cd "$ROOT"
for f in "${FILES[@]}"; do
  [ -e "$f" ] || { echo "deploy: missing $f" >&2; exit 1; }
done

if [ "${DEPLOY_ALLOW_DIRTY:-0}" != "1" ] && [ -n "$(git status --porcelain -- "${FILES[@]}")" ]; then
  echo "deploy: uncommitted changes in the deployed files:" >&2
  git status --short -- "${FILES[@]}" >&2
  echo "Commit them, or set DEPLOY_ALLOW_DIRTY=1." >&2
  exit 1
fi

OPTS=(-rlt --relative --itemize-changes --exclude=.DS_Store)
if [ "$DEPLOY_DELETE" = "1" ]; then OPTS+=(--delete); fi
if [ "$DRY_RUN" = "1" ]; then OPTS+=(--dry-run); fi

REV="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain -- "${FILES[@]}")" ]; then REV="$REV-dirty"; fi
NOTE=""
if [ "$DRY_RUN" = "1" ]; then NOTE=" (dry run)"; fi

if [ -z "$DEPLOY_HOST" ]; then
  DEST="$DEPLOY_PATH/"
  [ "$DRY_RUN" = "1" ] || mkdir -p "$DEPLOY_PATH"
else
  SSH=(ssh -p "$DEPLOY_PORT")
  OPTS+=(-e "ssh -p $DEPLOY_PORT")
  DEST="$DEPLOY_HOST:$DEPLOY_PATH/"
  [ "$DRY_RUN" = "1" ] || "${SSH[@]}" "$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH'"
fi

echo "deploy: $REV -> $DEST$NOTE"
rsync "${OPTS[@]}" "${FILES[@]}" "$DEST"
echo "deploy: done"
