#!/bin/sh
# Pre-build: adds Hugo front matter to story chapters that are missing it.
# Extracts title from first # heading, derives weight from chapter number.

STORY_DIR="$(dirname "$0")/../content/story"
fixed=0

for file in "$STORY_DIR"/chapter-*.md; do
  # Skip if front matter already present
  first=$(head -c 3 "$file")
  if [ "$first" = "---" ]; then
    continue
  fi

  # Extract heading line: "# Chapter NNN: Title"
  heading=$(head -1 "$file")
  title=$(echo "$heading" | sed 's/^# //')
  weight=$(echo "$title" | sed 's/Chapter \([0-9]*\):.*/\1/' | sed 's/^0*//')

  # Remove the heading line, write front matter + remaining body
  body=$(tail -n +2 "$file" | sed '/./,$!d')  # drop leading blank lines
  printf -- '---\ntitle: "%s"\nweight: %s\ndraft: false\n---\n\n%s\n' \
    "$title" "$weight" "$body" > "$file"

  echo "  Fixed: $(basename "$file")"
  fixed=$((fixed + 1))
done

if [ "$fixed" -gt 0 ]; then
  echo "Front matter added to $fixed file(s)."
else
  echo "All story chapters already have front matter."
fi
