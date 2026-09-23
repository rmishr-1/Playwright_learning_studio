#!/usr/bin/env python3
"""
Export every file-backed code block and exercise solution from json/course.json to disk.

    python3 tools/export_files.py

Creates:
  files/lessons/<path>     code the lessons put in the editor (e.g. tests/day1/auto-wait.spec.ts)
  files/starters/<path>    starter code for exercises that have one
  files/solutions/<path>   model solutions for code exercises

Use files/lessons/tests/day1/ to pre-load the Day 1 demo workspace, and
files/lessons/tests/day5/practice-pages.ts for the Day 5 practice pages.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "files"


def write(base, rel, content):
    path = OUT / base / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip("\n") + "\n", encoding="utf-8")
    return path


def main():
    week = json.loads((ROOT / "json" / "course.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    count = 0
    days = [d for wk in week["weeks"] for d in wk["days"]]
    for day in days:
        for section in day["sections"]:
            blocks = list(section["intro"]) + [b for l in section["lessons"] for b in l["blocks"]]
            for b in blocks:
                if b["type"] == "code" and b.get("file") and b.get("mode") == "editor":
                    # a broken-on-purpose sample and its fixed version may share a folder; keep both
                    write("lessons", b["file"], b["content"])
                    count += 1
                elif b["type"] == "exercise" and b.get("file"):
                    if b.get("starter"):
                        write("starters", b["file"], b["starter"])
                        count += 1
                    # skip partial snippets (e.g. a one-line fix) — only whole files are exported
                    whole_file = not b["file"].startswith("tests/") or "import " in b.get("solution", "")
                    if b.get("solution") and b["exerciseType"] == "code" and whole_file:
                        write("solutions", b["file"], b["solution"])
                        count += 1
    print(f"✓ exported {count} files to {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
