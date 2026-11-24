#!/usr/bin/env bash
set -euo pipefail
mode="${1:-}"
if [[ "$mode" != build && "$mode" != restore ]]; then
  echo "Usage: $0 build|restore" >&2; exit 2
fi
if [[ "$mode" == build && "${GITHUB_EVENT_NAME:-}" != schedule && "${GITHUB_EVENT_NAME:-}" != workflow_dispatch ]]; then
  echo "Refusing generated-data write outside a scheduled/manual build" >&2; exit 2
fi
root="$(git rev-parse --show-toplevel)"
cd "$root"
date_et="$(TZ=America/New_York date +%F)"
work="$(mktemp -d "${RUNNER_TEMP:-/tmp}/krillion.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
data="$work/data"
mkdir "$data"
ref=refs/heads/krillion-data
# Distinguish an absent branch from a network/authentication failure.
# Never silently replace a known-good site with an empty static directory.
remote="$(timeout 25 git ls-remote origin "$ref")"
old="$(printf '%s' "$remote" | cut -f1)"
if [[ -n "$old" ]]; then
  [[ "$old" =~ ^[a-f0-9]{40}$ ]]
  timeout 75 git fetch --no-tags --depth=1 origin "$ref"
  [[ "$(git rev-parse FETCH_HEAD)" == "$old" ]]
  git archive "$old" | tar -x -C "$data"
  node scripts/krillion-validate.mjs "$data"
fi
if [[ "$mode" == restore ]]; then
  if [[ -n "$old" ]]; then
    # The checkout is clean. Stage only this explicitly generated directory.
    mkdir -p src/krillion-data
    cp -a "$data/." src/krillion-data/
  fi
  exit 0
fi
archive_ref="refs/heads/krillion-archive-$date_et"
# Keep immutable per-date refs for old dives. Pages still carries only 3 days.
archive_old="$(timeout 25 git ls-remote origin "$archive_ref" | cut -f1)"
if [[ -f "$data/$date_et/manifest.json" ]]; then
  if [[ -z "$archive_old" ]]; then
    timeout 75 git push origin "$old:$archive_ref"
  fi
  echo "Already built and verified $date_et"
  exit 0
fi
if [[ -n "$archive_old" ]]; then
  echo "Archive ref already exists without a matching rolling snapshot" >&2; exit 1
fi
fresh="$work/fresh"
mkdir "$fresh"
# A failure stops the scheduled deployment but leaves main, the previous
# generated branch and the database fallback untouched.
timeout 210 node --max-old-space-size=768 scripts/krillion-static.mjs "$fresh" "$date_et"
node scripts/krillion-validate.mjs "$fresh" "$date_et"
mv "$fresh/$date_et" "$data/$date_et"
mapfile -t dates < <(find "$data" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)
for stale in "${dates[@]:3}"; do
  [[ "$stale" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
  rm -rf -- "$data/$stale"
done
node scripts/krillion-validate.mjs "$data" "$date_et"
# An isolated index/worktree, a root commit and a lease on one literal ref.
# No checkout or reset of main, no wildcard push, no unguarded force.
export GIT_INDEX_FILE="$work/index"
export GIT_DIR="$(git rev-parse --absolute-git-dir)"
export GIT_WORK_TREE="$data"
(
  cd "$data"
  git read-tree --empty
  git add -f --all -- .
  tree="$(git write-tree)"
  commit="$(git -c user.name=github-actions -c user.email=github-actions@github.com commit-tree "$tree" -m "Krillion static snapshot $date_et")"
  timeout 75 git push --atomic --force-with-lease="$ref:$old" origin "$commit:$ref" "$commit:$archive_ref"
)
echo "Verified and published generated snapshot for $date_et"
