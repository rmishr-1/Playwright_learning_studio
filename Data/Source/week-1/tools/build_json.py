#!/usr/bin/env python3
"""
Convert the course Markdown (markdown/dayN.md) into JSON (json/dayN.json + json/week1.json).

Usage:
    python3 tools/build_json.py

The Markdown format is described in FORMAT.md. The script also validates the content
(section order, quiz answers, unique ids, required exercise fields) and stops with a
clear error message if something is wrong.
"""
import json
import re
import shlex
import sys
from pathlib import Path

import yaml  # pip install pyyaml

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "markdown"
JSON_DIR = ROOT / "json"

SECTION_IDS = ["prerequisites", "fundamentals", "implementation", "practice"]
CALLOUT_VARIANTS = {"TIP", "NOTE", "WARNING", "TESTER", "DEEPDIVE", "PLATFORM"}
QUIZ_TYPES = {"single", "multiple", "truefalse"}
EXERCISE_TYPES = {"code", "terminal", "written", "predict"}
EXERCISE_LEVELS = {"easy", "medium", "hard", "challenge"}

FENCE_RE = re.compile(r"^(`{3,})(.*)$")
CALLOUT_RE = re.compile(r"^>\s*\[!([A-Z]+)\]\s*(.*)$")


class ContentError(Exception):
    pass


def slug(text):
    """'P1 · How the web works' -> 'p1-how-the-web-works'"""
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower())
    return text.strip("-")


def parse_info_string(info):
    """Parse '```ts file=a.ts mode=editor run="npx x"' -> ('ts', ['..flags'], {attrs})."""
    parts = shlex.split(info.strip()) if info.strip() else []
    lang = parts[0] if parts else ""
    flags, attrs = [], {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            attrs[k] = v
        else:
            flags.append(p)
    return lang, flags, attrs


def letters_to_index(letter, n_options, where):
    idx = ord(str(letter).strip().lower()) - ord("a")
    if idx < 0 or idx >= n_options:
        raise ContentError(f"{where}: answer '{letter}' is outside the options a..{chr(ord('a') + n_options - 1)}")
    return idx


def build_quiz(raw, where):
    try:
        q = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        raise ContentError(f"{where}: invalid quiz YAML: {e}")
    for field in ("id", "type", "question", "answer", "explanation"):
        if field not in q:
            raise ContentError(f"{where}: quiz is missing '{field}'")
    if q["type"] not in QUIZ_TYPES:
        raise ContentError(f"{where}: quiz {q['id']} has unknown type {q['type']}")
    where = f"{where} quiz {q['id']}"
    if q["type"] == "truefalse":
        if not isinstance(q["answer"], bool):
            raise ContentError(f"{where}: truefalse answer must be true or false")
        options = [{"id": "a", "text": "True"}, {"id": "b", "text": "False"}]
        correct = ["a" if q["answer"] else "b"]
    else:
        opts = q.get("options") or []
        if len(opts) < 2:
            raise ContentError(f"{where}: needs at least 2 options")
        options = [{"id": chr(ord("a") + i), "text": str(t)} for i, t in enumerate(opts)]
        answers = q["answer"] if isinstance(q["answer"], list) else [q["answer"]]
        if q["type"] == "single" and len(answers) != 1:
            raise ContentError(f"{where}: single-choice quiz needs exactly one answer")
        if q["type"] == "multiple" and len(answers) < 2:
            raise ContentError(f"{where}: multiple-choice quiz needs 2+ answers")
        correct = [options[letters_to_index(a, len(options), where)]["id"] for a in answers]
    block = {
        "type": "quiz",
        "id": q["id"],
        "quizType": q["type"],
        "question": str(q["question"]).rstrip(),
        "options": options,
        "correct": correct,
        "explanation": str(q["explanation"]).rstrip(),
    }
    if q.get("code"):
        block["code"] = str(q["code"]).rstrip("\n")
        block["codeLanguage"] = q.get("codeLanguage", "ts")
    return block


def build_exercise(raw, where):
    try:
        ex = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        raise ContentError(f"{where}: invalid exercise YAML: {e}")
    for field in ("id", "title", "level", "type", "prompt"):
        if field not in ex:
            raise ContentError(f"{where}: exercise is missing '{field}'")
    where = f"{where} exercise {ex['id']}"
    if ex["type"] not in EXERCISE_TYPES:
        raise ContentError(f"{where}: unknown type {ex['type']}")
    if ex["level"] not in EXERCISE_LEVELS:
        raise ContentError(f"{where}: unknown level {ex['level']}")
    if ex["type"] in ("code", "terminal") and "solution" not in ex:
        raise ContentError(f"{where}: code/terminal exercises need a 'solution'")
    if ex["type"] == "written" and "modelAnswer" not in ex:
        raise ContentError(f"{where}: written exercises need a 'modelAnswer'")
    if ex["type"] == "predict" and not ("code" in ex and "answer" in ex):
        raise ContentError(f"{where}: predict exercises need 'code' and 'answer'")
    block = {"type": "exercise", "exerciseType": ex["type"]}
    for key in ("id", "title", "level", "prompt", "file", "run", "starter", "hints",
                "solution", "expectedOutput", "modelAnswer", "code", "codeLanguage", "answer", "network", "rubric"):
        if key in ex:
            val = ex[key]
            block[key] = val.rstrip("\n") if isinstance(val, str) else val
    return block


def parse_day(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise ContentError(f"{path.name}: missing YAML front matter")
    meta = yaml.safe_load(m.group(1))
    body = text[m.end():].splitlines()

    day = {"schemaVersion": "1.0", "week": 1}
    day.update(meta)
    day["sections"] = []

    section = None
    lesson = None
    md_buffer = []
    last_block = None
    ids_seen = set()

    def target_blocks():
        if section is None:
            raise ContentError(f"{path.name}: content found before the first '# Section' heading")
        return lesson["blocks"] if lesson else section["intro"]

    def flush_md():
        nonlocal md_buffer, last_block
        content = "\n".join(md_buffer).strip("\n")
        md_buffer = []
        if content.strip():
            blk = {"type": "markdown", "content": content}
            target_blocks().append(blk)
            last_block = blk

    def add_block(blk):
        nonlocal last_block
        flush_md()
        if "id" in blk and blk["type"] in ("quiz", "exercise"):
            if blk["id"] in ids_seen:
                raise ContentError(f"{path.name}: duplicate id {blk['id']}")
            ids_seen.add(blk["id"])
        target_blocks().append(blk)
        last_block = blk

    i = 0
    while i < len(body):
        line = body[i]
        where = f"{path.name}:{i + 1 + text[:m.end()].count(chr(10))}"

        # ---- fenced block -------------------------------------------------
        fm = FENCE_RE.match(line)
        if fm:
            fence, info = fm.group(1), fm.group(2)
            j = i + 1
            content = []
            while j < len(body) and not body[j].startswith(fence):
                content.append(body[j])
                j += 1
            if j >= len(body):
                raise ContentError(f"{where}: unclosed code fence")
            raw = "\n".join(content)
            lang, flags, attrs = parse_info_string(info)

            if lang == "quiz":
                add_block(build_quiz(raw, where))
            elif lang == "exercise":
                add_block(build_exercise(raw, where))
            elif lang == "mermaid":
                add_block({"type": "diagram", "format": "mermaid", "content": raw})
            elif lang == "output":
                target = flags[0] if flags else "console"
                blk = {"type": "output", "target": target, "content": raw}
                # attach to the preceding code block as its expected output
                prev = last_block if not md_buffer or not "\n".join(md_buffer).strip() else None
                if prev and prev.get("type") == "code" and "expectedOutput" not in prev:
                    prev["expectedOutput"] = raw
                    prev["expectedOutputTarget"] = target
                add_block(blk)
            elif "terminal" in flags:
                cmds = [c for c in content if c.strip()]
                add_block({"type": "terminal", "shell": lang or "bash", "commands": cmds,
                           **({"cwd": attrs["cwd"]} if "cwd" in attrs else {})})
            else:
                blk = {"type": "code", "language": lang or "text", "content": raw,
                       "mode": attrs.get("mode", "read")}
                for k in ("file", "run"):
                    if k in attrs:
                        blk[k] = attrs[k]
                if attrs.get("expect") == "error":
                    blk["expectError"] = True
                if attrs.get("network") == "true":
                    blk["network"] = True
                if blk["mode"] not in ("read", "editor"):
                    raise ContentError(f"{where}: mode must be read or editor")
                add_block(blk)
            i = j + 1
            continue

        # ---- callout ------------------------------------------------------
        cm = CALLOUT_RE.match(line)
        if cm:
            variant, title = cm.group(1), cm.group(2).strip()
            if variant not in CALLOUT_VARIANTS:
                raise ContentError(f"{where}: unknown callout variant {variant}")
            j = i + 1
            content = []
            while j < len(body) and body[j].startswith(">"):
                content.append(re.sub(r"^>\s?", "", body[j]))
                j += 1
            blk = {"type": "callout", "variant": variant.lower(), "content": "\n".join(content).strip()}
            if title:
                blk["title"] = title
            add_block(blk)
            i = j
            continue

        # ---- headings -----------------------------------------------------
        if line.startswith("# "):
            flush_md()
            title = line[2:].strip()
            sid = slug(title)
            expected = SECTION_IDS[len(day["sections"])] if len(day["sections"]) < 4 else None
            if sid != expected:
                raise ContentError(f"{where}: expected section '{expected}', found '{title}'")
            section = {"id": sid, "title": title, "intro": [], "lessons": []}
            day["sections"].append(section)
            lesson = None
            last_block = None
            i += 1
            continue
        if line.startswith("## "):
            flush_md()
            if section is None:
                raise ContentError(f"{where}: lesson heading before any section")
            title = line[3:].strip()
            lesson = {
                "id": f"d{day['day']}-{section['id']}-{len(section['lessons']) + 1}",
                "title": title,
                "blocks": [],
            }
            section["lessons"].append(lesson)
            last_block = None
            i += 1
            continue

        md_buffer.append(line)
        i += 1

    flush_md()
    if [s["id"] for s in day["sections"]] != SECTION_IDS:
        raise ContentError(f"{path.name}: sections must be exactly {SECTION_IDS}")

    # stats
    def count(t):
        n = 0
        for s in day["sections"]:
            for b in s["intro"] + [b for l in s["lessons"] for b in l["blocks"]]:
                n += b["type"] == t
        return n

    day["stats"] = {
        "lessons": sum(len(s["lessons"]) for s in day["sections"]),
        "quizzes": count("quiz"),
        "exercises": count("exercise"),
        "codeBlocks": count("code"),
    }
    return day


def main():
    JSON_DIR.mkdir(exist_ok=True)
    days = []
    try:
        for path in sorted(MD_DIR.glob("day*.md")):
            day = parse_day(path)
            days.append(day)
            out = JSON_DIR / f"day{day['day']}.json"
            out.write_text(json.dumps(day, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"✓ {path.name} → {out.name}  {day['stats']}")
    except ContentError as e:
        print(f"✗ {e}")
        sys.exit(1)

    week = {
        "schemaVersion": "1.0",
        "week": 1,
        "title": "Week 1 — Fundamentals, Setup & Programming",
        "days": days,
    }
    (JSON_DIR / "week1.json").write_text(json.dumps(week, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"✓ week1.json ({len(days)} days)")


if __name__ == "__main__":
    main()
