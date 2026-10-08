# Jev assistant

Daily email triage, research, content and planning, with Jev AI (https://jev-ai.pro)
as the fast judgement layer. This folder is independent of the hotel website.

- `jev.py` — client. Standard library only, nothing to install. Needs Python 3.9+.
- `config.json` — every Jev question, the confidence thresholds, the model.
- `WORKFLOWS.md` — what Claude does in each workflow and the safety rules.
- `tests/test_jev.py` — unit tests of the routing logic (no network).
- `logs/decisions.jsonl` — every decision with its confidence (git-ignored; ids and answers only, never the text).

## Run it yourself, step by step

All commands start from the repository root (the folder that contains `package.json`).

### 1. Put the key in your terminal (not in a file, not in chat)

macOS / Linux:

    read -rs JEV_AI_API_KEY && export JEV_AI_API_KEY

After you press Enter nothing is shown; paste the key, press Enter again.
The variable lives only in that terminal window.

### 2. Check the connection (does not use the model, costs nothing)

    python3 tools/jev-assistant/jev.py check

You should see the model list and `Credits remaining: ...`.

### 3. Run the unit tests (no network)

    python3 -m unittest discover -s tools/jev-assistant/tests -v

### 4. One real decision (costs about 1 credit per item)

Create a file `emails.json`:

    [
      {"id": "t1", "text": "Subject: Meeting tomorrow\n\nCan we move tomorrow 10am to Thursday 3pm? Please confirm by tonight."}
    ]

Run:

    python3 tools/jev-assistant/jev.py decide --task email_triage --input emails.json

Output is JSON: for every item `route` (`high`, `medium`, `low`), `confidence`, `flags`
and the answers. Add `--dry-run` to see how many calls would be made without any network use.

Tasks: `email_triage`, `draft_quality`, `source_relevance`, `planning_priority`
(edit the questions in `config.json`).

## How routing works

| Jev confidence | Route | Action |
|---|---|---|
| 0.90 or more | high | code acts (labels) |
| 0.65 to 0.90 | medium | Claude takes a closer look |
| under 0.65, or "uncertain" | low | flagged for you |

A `sensitive` flag (money, legal, credentials) lowers high to medium. For noul (yes/no)
questions the confidence is the distance of the probability from 0.5.

## Cost

Without paid tokens each call takes 1 credit (header `X-Jev-Billing: credits-fallback`).
`jev.py decide` refuses to start a batch the balance cannot pay for.

## Safety

The key is read only from `JEV_AI_API_KEY`. If a key was ever pasted into a chat, revoke it
at https://jev-ai.pro/jev-api and create a new one.
