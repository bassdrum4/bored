#!/usr/bin/env bash
set -euo pipefail
date_et="$(TZ=America/New_York date +%F)"
data="$RUNNER_TEMP/krillion-static-data"
mkdir -p "$data"
ref=refs/heads/krillion-data
# This branch contains only generated public data. Its one root commit is
# replaced each day, rather than adding megabytes to main's permanent history.
remote="$(git ls-remote origin "$ref")"
old="$(printf '%s' "$remote" | cut -f1)"
if [ -n "$old" ]; then
  git fetch --no-tags --depth=1 origin "$ref"
  git archive FETCH_HEAD | tar -x -C "$data"
fi
if [ ! -f "$data/$date_et/manifest.json" ]; then
  fresh="$RUNNER_TEMP/krillion-fresh"
  mkdir -p "$fresh"
  if node scripts/krillion-static.mjs "$fresh" "$date_et"; then
    mv "$fresh/$date_et" "$data/$date_et"
    # Keep a short rolling window for recently started daily dives. Old
    # database-backed practice archives are untouched.
    mapfile -t dates < <(find "$data" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r)
    for stale in "${dates[@]:3}"; do rm -rf "$data/$stale"; done
    export GIT_INDEX_FILE="$RUNNER_TEMP/krillion-git-index"
    export GIT_DIR="$GITHUB_WORKSPACE/.git"
    export GIT_WORK_TREE="$data"
    (
      cd "$data"
      git read-tree --empty
      git add -f --all -- .
      tree="$(git write-tree)"
      commit="$(git -c user.name=github-actions -c user.email=github-actions@github.com commit-tree "$tree" -m "Krillion static snapshot $date_et")"
      git push --force-with-lease="$ref:$old" origin "$commit:$ref"
    )
    unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE
  else
    echo "::warning::Krillion upstream unavailable; keeping previous static assets and server fallback"
  fi
fi
mkdir -p src/krillion-data
cp -a "$data/." src/krillion-data/
