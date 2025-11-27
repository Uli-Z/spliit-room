#!/usr/bin/env bash
set -euo pipefail

# ==========================================
# Config (override via env)
# ==========================================
TRUNK="${TRUNK:-trunk}"                 # mirror of upstream/main
FORK_MAIN="${FORK_MAIN:-fork/main}"     # your maintained downstream line
BUNDLE="${BUNDLE:-bundle/fork-release}" # target bundle branch (can contain '/')
# Curated list of branches to bundle (default: PR branches)
BUNDLE_BRANCHES=(${BUNDLE_BRANCHES:-\
"feature/csv-export-saldo-revamp" \
"feature/generic-import" \
"fix/refactor-expense-calculation" \
"bug-fix-export-with-umlauts" \
"bugfix-incorrect-default-shares-evenly-mode" \
"bug-mark-as-paid" \
"serverside-default-split-options"\
})
DRY_RUN="${DRY_RUN:-0}"                 # 1 = do not modify repo, just print
STRATEGY_OPTS="${STRATEGY_OPTS:-}"      # e.g. "-X theirs" or "-X ours"

# Namespace auto-fix controls:
AUTO_RENAME_BLOCKING_LOCAL="${AUTO_RENAME_BLOCKING_LOCAL:-1}"   # 1 = rename blocking local branch
ALLOW_REMOTE_CHANGE="${ALLOW_REMOTE_CHANGE:-0}"                 # 1 = also push rename + delete remote blocker
REMOTE_NAME="${REMOTE_NAME:-origin}"

# Enable rerere to auto-reuse conflict resolutions:
ENABLE_RERERE="${ENABLE_RERERE:-1}"
AUTOUPDATE_RERERE="${AUTOUPDATE_RERERE:-1}"

# ==========================================
# Helpers
# ==========================================
die() { echo "ERROR: $*" >&2; exit 1; }
note() { echo "==> $*"; }
info() { echo "    $*"; }

is_clean() {
  git diff --quiet && git diff --cached --quiet
}

branch_exists_local() {
  git show-ref --verify --quiet "refs/heads/$1"
}

branch_exists_remote() {
  git ls-remote --heads "$REMOTE_NAME" "refs/heads/$1" >/dev/null
}

timestamp() {
  date +"%Y%m%d-%H%M%S"
}

patch_id_of() {
  git show -p --pretty=format:%B "$1" | git patch-id --stable | awk '{print $1}'
}

list_unique_commits() {
  # Commits in $2 that are NOT patch-identical to anything reachable from $1
  # Oldest first (rebase/cherry-pick friendly)
  local base="$1"; local branch="$2"
  git rev-list --reverse --no-merges --cherry-pick "${base}..${branch}"
}

pick_commit() {
  local sha="$1"
  if [ "$DRY_RUN" = "1" ]; then
    info "[dry-run] cherry-pick $sha"
    return 0
  fi
  if ! git cherry-pick -x $STRATEGY_OPTS "$sha"; then
    echo
    echo "Conflict in $sha."
    echo "Resolve, then:"
    echo "  git add <resolved files>"
    echo "  git cherry-pick --continue"
    echo "Or abort:"
    echo "  git cherry-pick --abort"
    exit 2
  fi
}

ensure_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Run inside a Git repo."
  is_clean || die "Working tree not clean. Commit or stash first."
  branch_exists_local "$TRUNK" || die "Local branch '$TRUNK' not found."
}

enable_rerere() {
  [ "$ENABLE_RERERE" = "1" ] || return 0
  git config rerere.enabled true
  [ "$AUTOUPDATE_RERERE" = "1" ] && git config rerere.autoUpdate true
}

ensure_namespace_free_or_fix() {
  # If BUNDLE contains '/', make sure the top-level name doesn't collide with a branch.
  [[ "$BUNDLE" == */* ]] || return 0
  local ns="${BUNDLE%%/*}"  # top-level namespace (e.g. "bundle" in "bundle/fork-release")

  if branch_exists_local "$ns"; then
    local new="$ns-old-$(timestamp)"
    if [ "$AUTO_RENAME_BLOCKING_LOCAL" = "1" ]; then
      note "Local branch '$ns' blocks creation of '$BUNDLE'. Renaming locally → '$new'."
      [ "$DRY_RUN" = "1" ] || git branch -m "$ns" "$new"
    else
      die "Local branch '$ns' blocks '$BUNDLE'. Set AUTO_RENAME_BLOCKING_LOCAL=1 to auto-rename."
    fi

    # Remote handling (optional)
    if branch_exists_remote "$ns"; then
      if [ "$ALLOW_REMOTE_CHANGE" = "1" ]; then
        note "Remote branch '$REMOTE_NAME/$ns' also blocks. Renaming remotely → '$new'."
        if [ "$DRY_RUN" = "1" ]; then
          info "[dry-run] git push $REMOTE_NAME refs/heads/$ns:refs/heads/$new"
          info "[dry-run] git push $REMOTE_NAME :$ns"
        else
          # "Rename" on remote = push under new name then delete old
          git push "$REMOTE_NAME" "refs/heads/$ns:refs/heads/$new"
          git push "$REMOTE_NAME" ":$ns"
        fi
      else
        note "Remote '$REMOTE_NAME/$ns' exists. It will continue to exist (no remote changes)."
        note "Set ALLOW_REMOTE_CHANGE=1 to also rename/delete on remote."
      fi
    fi
  fi
}

checkout_bundle_on_trunk() {
  note "Creating/resetting '$BUNDLE' from '$TRUNK'..."
  if [ "$DRY_RUN" = "1" ]; then
    info "[dry-run] git checkout -B $BUNDLE $TRUNK"
  else
    git checkout -B "$BUNDLE" "$TRUNK"
  fi
}

apply_from_branch() {
  local src="$1"
  note "Source: $src"
  local commits
  commits=$(list_unique_commits "$TRUNK" "$src" || true)

  if [ -z "${commits:-}" ]; then
    info "Nothing new (already in '$TRUNK' or patch-identical)."
    return 0
  fi

  while read -r c; do
    [ -z "$c" ] && continue
    # Deduplicate within this run via patch-id
    local pid; pid="$(patch_id_of "$c")"
    if grep -qx "$pid" "$APPLIED_PIDS"; then
      info "Skip (duplicate in this run): $c"
      continue
    fi
    info "Pick $c"
    pick_commit "$c"
    echo "$pid" >> "$APPLIED_PIDS"
  done <<< "$commits"
}

# ==========================================
# Main
# ==========================================
ensure_repo
enable_rerere
ensure_namespace_free_or_fix

# temp store for patch-ids applied in this run
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
APPLIED_PIDS="$TMPDIR/applied.patchids"
: > "$APPLIED_PIDS"

checkout_bundle_on_trunk

# 1) Apply commits from fork/main (your maintained downstream line)
apply_from_branch "$FORK_MAIN"

# 2) Apply commits from curated list of branches (aligned with upstream PRs)
for br in "${BUNDLE_BRANCHES[@]}"; do
  [ "$br" = "$FORK_MAIN" ] && continue
  if ! branch_exists_local "$br"; then
    note "Skip '$br' (branch not found locally)."
    continue
  fi
  apply_from_branch "$br"
done

echo
note "Bundle ready on '$BUNDLE'."
if [ "$DRY_RUN" = "1" ]; then
  note "(dry-run) Nothing pushed. Command to push:"
  echo "git push -f $REMOTE_NAME $BUNDLE"
else
  echo "Push with: git push -f $REMOTE_NAME $BUNDLE"
fi
