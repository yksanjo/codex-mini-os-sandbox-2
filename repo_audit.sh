#!/usr/bin/env bash
set -euo pipefail

USER_NAME="${1:-yksanjo}"
OUT_DIR="${2:-./audit_output}"
mkdir -p "$OUT_DIR"

repos_json="$OUT_DIR/repos.jsonl"
report_csv="$OUT_DIR/repo_audit.csv"
summary_md="$OUT_DIR/summary.md"
: > "$repos_json"

page=1
while :; do
  resp=$(curl -s "https://api.github.com/users/${USER_NAME}/repos?per_page=100&page=${page}&sort=updated")
  count=$(printf '%s' "$resp" | jq 'length')
  if [ "$count" -eq 0 ]; then
    break
  fi
  printf '%s\n' "$resp" | jq -c '.[]' >> "$repos_json"
  page=$((page+1))
  sleep 0.2
done

printf 'name,private,archived,default_branch,language,stars,forks,open_issues,has_wiki,has_projects,has_pages,pushed_at,updated_at,url,score,tier\n' > "$report_csv"

total=0
high=0
medium=0
low=0

while IFS= read -r row; do
  name=$(printf '%s' "$row" | jq -r '.name')
  private=$(printf '%s' "$row" | jq -r '.private')
  archived=$(printf '%s' "$row" | jq -r '.archived')
  branch=$(printf '%s' "$row" | jq -r '.default_branch // ""')
  language=$(printf '%s' "$row" | jq -r '.language // ""')
  stars=$(printf '%s' "$row" | jq -r '.stargazers_count')
  forks=$(printf '%s' "$row" | jq -r '.forks_count')
  issues=$(printf '%s' "$row" | jq -r '.open_issues_count')
  wiki=$(printf '%s' "$row" | jq -r '.has_wiki')
  projects=$(printf '%s' "$row" | jq -r '.has_projects')
  pages=$(printf '%s' "$row" | jq -r '.has_pages')
  pushed=$(printf '%s' "$row" | jq -r '.pushed_at // ""')
  updated=$(printf '%s' "$row" | jq -r '.updated_at // ""')
  url=$(printf '%s' "$row" | jq -r '.html_url')

  score=0
  [ "$archived" = "false" ] && score=$((score+20))
  [ -n "$language" ] && score=$((score+10))
  [ "$branch" = "main" ] || [ "$branch" = "master" ] && score=$((score+10))
  [ "$stars" -gt 0 ] && score=$((score+10))
  [ "$forks" -gt 0 ] && score=$((score+5))
  [ "$wiki" = "true" ] && score=$((score+5))
  [ "$projects" = "true" ] && score=$((score+5))
  [ "$pages" = "true" ] && score=$((score+5))
  [ "$issues" -eq 0 ] && score=$((score+5))

  # Recency heuristic: +20 if pushed in last ~365 days
  if [ -n "$pushed" ]; then
    now=$(date -u +%s)
    psec=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$pushed" +%s 2>/dev/null || echo 0)
    if [ "$psec" -gt 0 ]; then
      diff_days=$(( (now - psec) / 86400 ))
      [ "$diff_days" -le 365 ] && score=$((score+20))
    fi
  fi

  tier="low"
  if [ "$score" -ge 65 ]; then
    tier="high"
    high=$((high+1))
  elif [ "$score" -ge 40 ]; then
    tier="medium"
    medium=$((medium+1))
  else
    low=$((low+1))
  fi

  total=$((total+1))
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$name" "$private" "$archived" "$branch" "$language" "$stars" "$forks" "$issues" "$wiki" "$projects" "$pages" "$pushed" "$updated" "$url" "$score" "$tier" \
    >> "$report_csv"
done < "$repos_json"

{
  echo "# GitHub Repo Audit Summary"
  echo
  echo "- User: ${USER_NAME}"
  echo "- Total public repos audited: ${total}"
  echo "- High tier: ${high}"
  echo "- Medium tier: ${medium}"
  echo "- Low tier: ${low}"
  echo
  echo "Top 20 by score:"
  echo
  { head -n 1 "$report_csv"; tail -n +2 "$report_csv" | sort -t, -k15,15nr | head -n 20; } | column -s, -t
} > "$summary_md"

echo "Wrote: $report_csv"
echo "Wrote: $summary_md"
