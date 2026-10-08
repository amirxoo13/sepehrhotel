#!/usr/bin/env python3
"""Jev AI client for the daily workflow.

Commands
  check                 GET /v1/models and /v1/credits. Does not run the model.
  decide --task NAME    Read a JSON list [{"id": "...", "text": "..."}] from --input
                        or stdin, ask Jev the questions of that task for every item,
                        route each item by confidence and write the result as JSON
                        to stdout.

The API key is read only from the environment variable JEV_AI_API_KEY and is never
printed or written to disk. The decision log stores ids, answers and confidence, never
the text of the items.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
LOG_PATH = HERE / "logs" / "decisions.jsonl"
USER_AGENT = "jev-assistant/1.0"


class JevError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def load_config(path=CONFIG_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_api_key():
    key = os.environ.get("JEV_AI_API_KEY", "").strip()
    if not key:
        sys.exit(
            "JEV_AI_API_KEY is not set. Export it in your shell or add it to the "
            "environment settings, then run again."
        )
    return key


def api_request(method, url, key, body=None, timeout=60):
    """One HTTP call. Returns (status, headers, parsed_json). Raises JevError on 4xx/5xx."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("User-Agent", USER_AGENT)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, dict(resp.headers), json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except ValueError:
            detail = raw[:300]
        err = JevError(e.code, "HTTP %d: %s" % (e.code, json.dumps(detail, ensure_ascii=False)[:400]))
        err.headers = dict(e.headers)
        raise err
    except urllib.error.URLError as e:
        raise JevError(0, "Network error: %s" % e.reason)


def call_with_retry(method, url, key, body=None):
    """Retry only where the docs say no charge happened: 429 (slow down) and 502/504.
    Any other failure is not replayed, so a request with an uncertain outcome is never doubled."""
    attempts = 0
    while True:
        try:
            return api_request(method, url, key, body)
        except JevError as e:
            attempts += 1
            if e.status == 429 and attempts <= 3:
                wait = 5
                try:
                    wait = int(getattr(e, "headers", {}).get("Retry-After", 5))
                except (TypeError, ValueError):
                    pass
                time.sleep(min(max(wait, 1), 30))
                continue
            if e.status in (502, 504) and attempts <= 2:
                time.sleep(3)
                continue
            raise


# ---------- pure routing logic (no network) ----------

def answer_value(a):
    t = a.get("type")
    if t == "noul":
        return a.get("noul")
    if t == "choice":
        return a.get("choice")
    if t == "score":
        return a.get("score")
    return None


def answer_confidence(a):
    """noul is the probability of yes, so confidence is how far it is from 0.5."""
    if a.get("type") == "noul":
        p = float(a.get("noul", 0.5))
        return max(p, 1.0 - p)
    return float(a.get("confidence", 0.0))


def route_item(answers, task_cfg, thresholds):
    """Return (route, confidence, flags). route is 'high', 'medium' or 'low'."""
    primary = answers[task_cfg["primary"]]
    conf = answer_confidence(primary)
    flags = []

    if conf >= thresholds["high"]:
        route = "high"
    elif conf >= thresholds["medium"]:
        route = "medium"
    else:
        route = "low"

    uncertain = task_cfg.get("uncertain_label")
    if uncertain and primary.get("type") == "choice" and primary.get("choice") == uncertain:
        route = "low"
        flags.append("uncertain")

    for q in task_cfg.get("cap_if_yes", []):
        if q in answers and float(answers[q].get("noul", 0.0)) >= 0.5:
            flags.append(q)
            if route == "high":
                route = "medium"

    for q in task_cfg.get("flag_if_yes", []):
        if q in answers and float(answers[q].get("noul", 0.0)) >= 0.5:
            flags.append(q)

    return route, conf, flags


def build_request(task_cfg, text, config):
    return {
        "model": config["model"],
        "state": text[: config["max_chars_per_item"]],
        "questions": task_cfg["questions"],
    }


def compact_answers(answers):
    return {
        q: {"value": answer_value(a), "confidence": round(answer_confidence(a), 4)}
        for q, a in answers.items()
    }


# ---------- commands ----------

def cmd_check(config, key):
    base = config["base_url"].rstrip("/")
    _, _, models = call_with_retry("GET", base + "/v1/models", key)
    print("Models:")
    for m in models.get("models", []):
        print("  - %-18s configured=%s multiplier=%s" % (
            m.get("name"), m.get("configured"), m.get("billing", {}).get("multiplier")))
    _, _, credits = call_with_retry("GET", base + "/v1/credits", key)
    print("Credits remaining: %s | paid input tokens remaining: %s | spending_frozen: %s" % (
        credits.get("creditsRemaining"), credits.get("paidInputTokensRemaining"),
        credits.get("spending_frozen")))


def append_log(entry):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def cmd_decide(config, key, task_name, items, dry_run=False):
    if task_name not in config["tasks"]:
        sys.exit("Unknown task '%s'. Available: %s" % (task_name, ", ".join(config["tasks"])))
    task_cfg = config["tasks"][task_name]
    base = config["base_url"].rstrip("/")

    for i, it in enumerate(items):
        if not isinstance(it, dict) or "id" not in it or "text" not in it:
            sys.exit("Item %d must be an object with 'id' and 'text'." % i)

    if dry_run:
        print("Dry run: %d call(s) would be made with task '%s', model '%s'. No network used." % (
            len(items), task_name, config["model"]), file=sys.stderr)
        return []

    # Guard: do not start a batch that the balance cannot pay for.
    _, _, credits = call_with_retry("GET", base + "/v1/credits", key)
    if credits.get("spending_frozen"):
        sys.exit("Spending is frozen on this account. Stopping.")
    available = credits.get("creditsRemaining", 0)
    tokens = credits.get("paidInputTokensRemaining", 0)
    if tokens == 0 and available < len(items) + config["credit_reserve"]:
        sys.exit("Not enough credits: %s left, %d items need about %d plus a reserve of %d. "
                 "Nothing was sent." % (available, len(items), len(items), config["credit_reserve"]))

    results = []
    for it in items:
        result = {"id": it["id"], "task": task_name}
        try:
            status, headers, resp = call_with_retry(
                "POST", base + "/v1/systemone", key, build_request(task_cfg, it["text"], config))
            answers = resp["answers"]
            route, conf, flags = route_item(answers, task_cfg, config["thresholds"])
            billing = {k.lower(): v for k, v in headers.items() if k.lower().startswith("x-jev-")}
            result.update({
                "route": route,
                "confidence": round(conf, 4),
                "flags": flags,
                "answers": compact_answers(answers),
                "billing": {
                    "mode": billing.get("x-jev-billing"),
                    "credits_charged": billing.get("x-jev-credits-charged"),
                    "credits_remaining": billing.get("x-jev-credits-remaining"),
                },
                "error": None,
            })
        except JevError as e:
            result.update({"route": "error", "confidence": None, "flags": [], "answers": {},
                           "billing": {}, "error": str(e)})
            results.append(result)
            append_log(dict(result, ts=datetime.now(timezone.utc).isoformat()))
            if e.status in (401, 402):
                print("Stopping the batch: %s" % e, file=sys.stderr)
                break
            continue
        results.append(result)
        append_log(dict(result, ts=datetime.now(timezone.utc).isoformat()))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    d = sub.add_parser("decide")
    d.add_argument("--task", required=True)
    d.add_argument("--input", help="JSON file with the items. Default: stdin.")
    d.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    config = load_config()
    if args.cmd == "check":
        cmd_check(config, get_api_key())
        return

    raw = open(args.input, encoding="utf-8").read() if args.input else sys.stdin.read()
    items = json.loads(raw)
    key = None if args.dry_run else get_api_key()
    results = cmd_decide(config, key, args.task, items, dry_run=args.dry_run)
    json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
    print()
    counts = {}
    for r in results:
        counts[r["route"]] = counts.get(r["route"], 0) + 1
    print("Summary: %s" % json.dumps(counts), file=sys.stderr)


if __name__ == "__main__":
    main()
