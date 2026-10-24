#!/usr/bin/env bash
# Claude Code status line. Reads JSON on stdin.
input=$(cat)

EMAIL=$(git config user.email 2>/dev/null)

# Extract a value: jq if available, otherwise a crude grep/sed fallback.
# Usage: get <jq-path> <flat-key-regex-name>
if command -v jq >/dev/null 2>&1; then
  get() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
else
  get_raw() { printf '%s' "$input" | tr -d '\n' | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\(\"[^\"]*\"\|[0-9.]*\)" | head -n1 | sed 's/^[^:]*:[[:space:]]*//; s/^"//; s/"$//'; }
  get() {
    case "$1" in
      .model.display_name) get_raw display_name ;;
      .workspace.project_dir) get_raw project_dir ;;
      .workspace.current_dir) get_raw current_dir ;;
      .cwd) get_raw cwd ;;
      .context_window.used_percentage) get_raw used_percentage ;;
      .cost.total_cost_usd) get_raw total_cost_usd ;;
    esac
  }
fi

model=$(get .model.display_name)
dir=$(get .workspace.project_dir)
[ -z "$dir" ] && dir=$(get .workspace.current_dir)
[ -z "$dir" ] && dir=$(get .cwd)
dir=${dir//\\\\/\/}   # unescape doubled backslashes from the fallback parser
folder=$(basename "$dir" 2>/dev/null)
[ -z "$folder" ] && folder="$dir"

used=$(get .context_window.used_percentage)
cost=$(get .cost.total_cost_usd)

DIM=$'\033[2m'; RST=$'\033[0m'; GRN=$'\033[32m'; YEL=$'\033[33m'; RED=$'\033[31m'; CYN=$'\033[36m'
SEP=" ${DIM}|${RST} "

# Row 1
printf '%s%s%s%s%s%s%s%s%s\n' "$CYN" "${model:-Claude}" "$RST" "$SEP" "${folder:-?}" "$SEP" "$DIM" "${EMAIL:-?}" "$RST"

# Row 2: context bar
if [ -n "$used" ]; then
  pct=$(printf '%.0f' "$used" 2>/dev/null || echo 0)
  [ "$pct" -gt 100 ] && pct=100
  [ "$pct" -lt 0 ] && pct=0
  if [ "$pct" -ge 70 ]; then col=$RED; elif [ "$pct" -ge 30 ]; then col=$YEL; else col=$GRN; fi
  width=10
  filled=$(( pct * width / 100 ))
  bar=""
  i=0
  while [ $i -lt $width ]; do
    if [ $i -lt $filled ]; then bar="${bar}█"; else bar="${bar}░"; fi
    i=$((i+1))
  done
  ctx="${col}${bar} ${pct}%${RST}"
else
  ctx="${DIM}░░░░░░░░░░ --%${RST}"
fi

row2="$ctx"

# Cost
if [ -n "$cost" ]; then
  row2="${row2}${SEP}$(printf '$%.2f' "$cost")"
else
  row2="${row2}${SEP}\$0.00"
fi

# Git branch (no optional locks); omitted if not a git repo
if [ -n "$dir" ] && [ -d "$dir" ]; then
  branch=$(git -C "$dir" --no-optional-locks symbolic-ref --short -q HEAD 2>/dev/null \
        || git -C "$dir" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
  [ -n "$branch" ] && row2="${row2}${SEP}${branch}"
fi

printf '%s\n' "$row2"
