#!/usr/bin/env python3
"""
Run every runnable code sample and exercise solution in json/course.json and compare the
results with the expected output written in the course.

What it checks
  • ts-basics samples/solutions : type-check (tsc --strict) must pass (or fail when expect=error),
                                  `node file.ts` output must equal the expected console output
  • predict exercises           : the program's output lines must appear in the revealed answer
  • Playwright tests            : type-check with tsc, then run with Playwright; tests marked
                                  expect=error must fail, all others must pass
  • network=true blocks         : type-checked only (no internet needed)

Usage (from the course folder):
    python3 tools/verify_code.py --pw-project /path/to/a/playwright/project \
                                 --ts-modules /path/to/node_modules/with/typescript \
                                 [--chromium /path/to/chrome]

The Playwright project must have @playwright/test and @types/node installed.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# folders of a Playwright project (Day 10's framework layers) whose files are checked and run together
FRAMEWORK_ROOTS = ("tests/", "pages/", "fixtures/", "test-data/", "utils/")

CHECK_FLAGS = ["--noEmit", "--strict", "--target", "esnext", "--module", "nodenext", "--allowImportingTsExtensions", "--ignoreConfig", "--pretty", "false"]


def run(cmd, cwd, timeout=300):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def norm(text):
    return "\n".join(line.rstrip() for line in text.strip("\n").splitlines())


def iter_blocks(course):
    for wk in course["weeks"]:
        for day in wk["days"]:
            for section in day["sections"]:
                for block in section["intro"]:
                    yield day["day"], section["id"], None, block
                for lesson in section["lessons"]:
                    for block in lesson["blocks"]:
                        yield day["day"], section["id"], lesson["title"], block


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pw-project", required=True)
    ap.add_argument("--ts-modules", required=True, help="node_modules folder that contains typescript")
    ap.add_argument("--chromium", default="")
    ap.add_argument("--workdir", default=str(ROOT / ".verify"))
    ap.add_argument("--show-output", action="store_true", help="print Playwright's list output")
    args = ap.parse_args()

    week = json.loads((ROOT / "json" / "course.json").read_text())
    work = Path(args.workdir)
    if work.exists():
        shutil.rmtree(work)
    pw = work / "pw-course"
    tsb = pw / "ts-basics"
    (pw / "tests").mkdir(parents=True)
    tsb.mkdir(parents=True)

    # --- workspace: Playwright project + ts-basics playground --------------------------
    os.symlink(Path(args.pw_project) / "node_modules", pw / "node_modules")
    (pw / "package.json").write_text(json.dumps({"name": "pw-course", "private": True}))
    tsc = str(Path(args.ts_modules) / ".bin" / "tsc")
    launch = f"launchOptions: {{ executablePath: '{args.chromium}' }}," if args.chromium else ""
    (pw / "verify.config.ts").write_text(f"""
import {{ defineConfig }} from '@playwright/test';
export default defineConfig({{
  testDir: './tests', fullyParallel: true, reporter: [['list'], ['json', {{ outputFile: 'results.json' }}]],
  use: {{ baseURL: 'https://qa-academy.test', {launch} }},
  projects: [{{ name: 'chromium' }}],
}});
""")
    (pw / "tsconfig.json").write_text(json.dumps({
        "compilerOptions": {"strict": True, "noEmit": True, "target": "esnext", "module": "preserve",
                            "moduleResolution": "bundler", "types": ["node"], "skipLibCheck": True},
        "include": ["tests/**/*.ts", "pages/**/*.ts", "fixtures/**/*.ts", "test-data/**/*.ts", "utils/**/*.ts", "typecheck/**/*.ts"],
    }))
    (tsb / "package.json").write_text(json.dumps({"name": "ts-basics", "type": "module"}))
    os.symlink(Path(args.ts_modules), tsb / "node_modules")

    failures, passes = [], 0

    def fail(label, msg):
        failures.append(f"✗ {label}\n    {msg}")

    def ok():
        nonlocal passes
        passes += 1

    # --- collect everything --------------------------------------------------------
    ts_items = []        # (label, relpath_in_tsb, code, expect_error, expected, target)
    pw_files = {}        # relpath -> (label, code, expect_error)
    typecheck_only = []  # (label, relpath, code)
    predicts = []

    for day, sec, lesson, b in iter_blocks(week):
        if b["type"] == "code" and b.get("file"):
            label = f"Day {day} · {lesson} · {b['file']}"
            f = b["file"]
            if f.startswith("ts-basics/") and not f.endswith(".ts"):
                continue  # e.g. ts-basics/tsconfig.json — a settings file, nothing to run
            if f.startswith("ts-basics/"):
                ts_items.append((label, f[len("ts-basics/"):], b["content"], b.get("expectError", False),
                                 b.get("expectedOutput"), b.get("expectedOutputTarget"), bool(b.get("run"))))
            elif f == "playwright.config.ts":
                typecheck_only.append((label, "typecheck/config-" + re.sub(r"\W+", "-", label) + ".ts", b["content"]))
            elif f.startswith(FRAMEWORK_ROOTS):
                if b.get("network"):
                    typecheck_only.append((label, f, b["content"]))
                else:
                    pw_files[f] = (label, b["content"], b.get("expectError", False))
        elif b["type"] == "exercise":
            label = f"Day {day} · exercise {b['id']}"
            et = b["exerciseType"]
            f = b.get("file", "")
            if et == "code" and f.startswith("ts-basics/"):
                ts_items.append((label, f[len("ts-basics/"):], b["solution"], False,
                                 b.get("expectedOutput"), "console", True))
            elif et == "code" and f.startswith(FRAMEWORK_ROOTS) and ("import {" in b["solution"] or not f.startswith("tests/")):
                if f in pw_files:
                    # the solution rewrites a lesson file: check both, side by side
                    f = f.replace(".spec.ts", f".{b['id']}-solution.spec.ts")
                if b.get("network"):
                    typecheck_only.append((label, f, b["solution"]))
                else:
                    pw_files[f] = (label, b["solution"], False)
            elif et == "code" and f == "playwright.config.ts":
                typecheck_only.append((label, "typecheck/config-" + b["id"] + ".ts", b["solution"]))
            elif et == "predict" and b.get("codeLanguage", "ts") == "ts":
                predicts.append((label, b["code"], b["answer"]))

    # --- ts-basics ----------------------------------------------------------------
    for label, rel, code, expect_error, expected, target, runnable in ts_items:
        path = tsb / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(code + "\n")
    for label, rel, code, expect_error, expected, target, runnable in ts_items:
        rc, out, err = run([tsc, *CHECK_FLAGS, rel], cwd=tsb)
        tsc_out = norm(out + err)
        if expect_error:
            if rc == 0:
                fail(label, "expected a type error, but the check passed")
                continue
            if expected and target == "terminal":
                # compare only the "error TS…" lines (npm's "> …" header lines are not part of tsc's output)
                want = [ln.strip() for ln in expected.splitlines() if "error TS" in ln]
                got = [ln.strip() for ln in tsc_out.splitlines() if "error TS" in ln]
                if want != got:
                    fail(label, f"type-check errors differ.\n--- expected\n" + "\n".join(want) + "\n--- actual\n" + "\n".join(got))
                    continue
            if expected and target == "console":
                # a file with type errors that still runs: its output must match too
                rc2, out2, err2 = run(["node", rel], cwd=tsb)
                if norm(out2) != norm(expected):
                    fail(label, f"output differs.\n--- expected\n{expected}\n--- actual\n{out2}")
                    continue
            ok()
            continue
        if rc != 0:
            fail(label, f"type-check failed:\n{tsc_out}")
            continue
        if not runnable:
            ok()
            continue
        rc, out, err = run(["node", rel], cwd=tsb)
        if rc != 0:
            fail(label, f"node exited with {rc}:\n{err}")
        elif expected is not None and target == "console" and norm(out) != norm(expected):
            fail(label, f"output differs.\n--- expected\n{expected}\n--- actual\n{out}")
        else:
            ok()

    # --- predict exercises ------------------------------------------------------------
    for label, code, answer in predicts:
        path = tsb / "predict" / (re.sub(r"\W+", "-", label) + ".ts")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(code + "\n")
        rel = str(path.relative_to(tsb))
        rc, out, err = run([tsc, *CHECK_FLAGS, rel], cwd=tsb)
        if rc != 0:
            # scope/type-error predictions: the answer must mention the checker's complaint
            msg = re.search(r"error TS\d+: (.*)", out)
            if msg and msg.group(1).split("'")[0].strip() in answer:
                ok()
            else:
                fail(label, f"type error not reflected in answer:\n{out}")
            continue
        rc, out, err = run(["node", rel], cwd=tsb)
        answer_flat = answer.replace("`", "")
        missing = [ln for ln in norm(out).splitlines() if ln.strip() and ln.strip() not in answer_flat]
        if missing:
            fail(label, f"output lines not found in the answer: {missing}\n--- output\n{out}")
        else:
            ok()

    # --- Playwright tests -------------------------------------------------------------
    for rel, (label, code, _) in pw_files.items():
        p = pw / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(code + "\n")
    for label, rel, code in typecheck_only:
        p = pw / (rel if rel.startswith("typecheck/") else "typecheck/" + rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(code + "\n")

    rc, out, err = run([tsc, "-p", "tsconfig.json"], cwd=pw)
    tsc_lines = [ln for ln in (out + err).splitlines() if "error TS" in ln]
    # files that are *supposed* to be broken may still type-check fine (runtime failures)
    if tsc_lines:
        fail("Playwright test files · type-check", "\n    ".join(tsc_lines))
    else:
        ok()

    rc, out, err = run(["npx", "playwright", "test", "-c", "verify.config.ts"], cwd=pw, timeout=900)
    if args.show_output:
        print(out)
    results = json.loads((pw / "results.json").read_text())

    status_by_file = {}

    def walk(suite):
        for spec in suite.get("specs", []):
            for t in spec["tests"]:
                # the test-level status already accounts for test.fail(): expected / unexpected / flaky / skipped
                st = t.get("status", "skipped")
                status_by_file.setdefault(spec["file"], []).append((spec["title"], st))
        for s in suite.get("suites", []):
            walk(s)

    for s in results["suites"]:
        walk(s)

    for rel, (label, code, expect_error) in pw_files.items():
        if not rel.endswith(".spec.ts"):
            continue  # helper modules (e.g. practice-pages.ts) contain no tests
        key = rel[len("tests/"):]
        statuses = status_by_file.get(key)
        if not statuses:
            fail(label, "no tests were collected")
            continue
        bad = [(t, s) for t, s in statuses if s not in ("expected", "skipped")]
        if expect_error:
            if not bad:
                fail(label, "expected failures, but everything passed")
            else:
                ok()
        elif bad:
            fail(label, f"failed tests: {bad}")
        else:
            ok()

    print(f"\n{passes} checks passed, {len(failures)} failed")
    for f in failures:
        print(f)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
