#!/usr/bin/env python3
"""Pre-build script: adds Hugo front matter to story chapters that are missing it.

Scans content/story/*.md. If a file lacks a --- front matter block, it extracts
the title from the first # heading, derives weight from the chapter number, and
prepends the front matter before the body text.
"""

import os
import re
import sys

STORY_DIR = os.path.join(os.path.dirname(__file__), "..", "content", "story")
HEADING_RE = re.compile(r"^# (Chapter (\d+): .+)")


def fix_file(path: str) -> bool:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if content.startswith("---"):
        return False  # already has front matter

    m = HEADING_RE.match(content)
    if not m:
        print(f"  SKIP {os.path.basename(path)}: no chapter heading found", file=sys.stderr)
        return False

    title = m.group(1)
    weight = int(m.group(2))
    body = content[m.end():].lstrip("\n")

    front_matter = f'---\ntitle: "{title}"\nweight: {weight}\ndraft: false\n---\n\n'
    with open(path, "w", encoding="utf-8") as f:
        f.write(front_matter + body)

    print(f"  Fixed: {os.path.basename(path)}")
    return True


def main():
    story_dir = os.path.normpath(STORY_DIR)
    if not os.path.isdir(story_dir):
        print(f"Story directory not found: {story_dir}", file=sys.stderr)
        sys.exit(1)

    fixed = 0
    for fname in sorted(os.listdir(story_dir)):
        if fname.endswith(".md"):
            if fix_file(os.path.join(story_dir, fname)):
                fixed += 1

    if fixed:
        print(f"Front matter added to {fixed} file(s).")
    else:
        print("All story chapters already have front matter.")


if __name__ == "__main__":
    main()
