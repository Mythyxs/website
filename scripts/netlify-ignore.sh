#!/usr/bin/env bash
# Netlify runs this before every build: exit 0 skips the deploy, anything else builds.

# Manual redeploys and cache misses arrive with both refs equal; always build those.
if [ -z "$CACHED_COMMIT_REF" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  exit 1
fi

git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . ':(exclude)anime_backup.json'
