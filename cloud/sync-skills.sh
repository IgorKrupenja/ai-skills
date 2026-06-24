#!/usr/bin/env bash
# Regenerate .claude/skills/ symlinks.
#
# Claude Code only auto-registers skills under .claude/skills/<name>/SKILL.md, but this
# repo keeps each skill at the root (spotify/, volta-sales-crawl/, ...) for the
# cross-tool agentskills.io layout. Cloud/web sessions clone the repo and auto-load
# <repo>/.claude/skills/, so these relative symlinks make every root skill discoverable
# as a project skill WITHOUT moving anything.
#
# Why per-skill links instead of one .claude/skills -> .. symlink: pointing the whole
# dir at the repo root is self-referential (.claude lives inside the root), so
# .claude/skills/.claude/skills/... loops forever and can spin the live-reload watcher.
# Per-skill links target leaf folders (../../<name>) that contain no .claude — no loop.
#
# Re-run after adding or removing a root skill folder.
set -euo pipefail
cd "$(dirname "$0")/.."                       # repo root
mkdir -p .claude/skills
find .claude/skills -maxdepth 1 -type l -delete   # clear stale links, then rebuild
for d in */; do
  name="${d%/}"
  [ -f "$name/SKILL.md" ] || continue        # only dirs that are actually skills
  ln -s "../../$name" ".claude/skills/$name"
  echo "linked $name"
done
