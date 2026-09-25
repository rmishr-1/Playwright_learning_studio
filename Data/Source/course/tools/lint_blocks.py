#!/usr/bin/env python3
"""Report every YAML problem in quiz/exercise blocks at once (build_json stops at the first)."""
import re
import sys
from pathlib import Path

import yaml

bad = 0
for p in sorted(Path(__file__).resolve().parent.parent.glob("markdown/day*.md")):
    lines = p.read_text().split("\n")
    i = 0
    while i < len(lines):
        m = re.match(r"^(`{3,})(quiz|exercise)\s*$", lines[i])
        if m:
            fence, j, buf = m.group(1), i + 1, []
            while not lines[j].startswith(fence):
                buf.append(lines[j]); j += 1
            try:
                d = yaml.safe_load("\n".join(buf))
                for k in ("hints", "options", "rubric"):
                    for it in d.get(k) or []:
                        if not isinstance(it, str):
                            bad += 1
                            print(f"{p.name}:{i+1} {d.get('id')} {k} item parsed as {type(it).__name__}: {it!r}")
            except yaml.YAMLError as e:
                bad += 1
                print(f"{p.name}:{i+1} YAML: {str(e).splitlines()[0]} | {' '.join(str(e).split())[-120:]}")
            i = j
        i += 1
sys.exit(1 if bad else 0)
