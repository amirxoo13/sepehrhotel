"""Unit tests for the local routing logic in jev.py. They do not use the network.

Run from the repository root:
    python3 -m unittest discover -s tools/jev-assistant/tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jev  # noqa: E402

CONFIG = jev.load_config()
EMAIL = CONFIG["tasks"]["email_triage"]
DRAFT = CONFIG["tasks"]["draft_quality"]
TH = CONFIG["thresholds"]

# Real answer returned by jev-ai.pro for the test email
# "can we move tomorrow's 10am meeting to Thursday 3pm? Please confirm by tonight."
REAL_ANSWERS = {
    "category": {
        "type": "choice",
        "choice": "needs_reply",
        "probabilities": {"needs_reply": 1, "info_only": 0, "promo": 0, "uncertain": 0},
        "confidence": 1,
    },
    "urgent": {"type": "noul", "noul": 0.97},
}


def choice(label, conf):
    return {"type": "choice", "choice": label, "confidence": conf}


def noul(p):
    return {"type": "noul", "noul": p}


class RoutingTests(unittest.TestCase):
    def test_real_response_routes_high_and_flags_urgent(self):
        route, conf, flags = jev.route_item(REAL_ANSWERS, EMAIL, TH)
        self.assertEqual(route, "high")
        self.assertEqual(conf, 1.0)
        self.assertEqual(flags, ["urgent"])

    def test_medium_band(self):
        answers = {"category": choice("info_only", 0.80), "urgent": noul(0.1), "sensitive": noul(0.1)}
        self.assertEqual(jev.route_item(answers, EMAIL, TH)[0], "medium")

    def test_low_band(self):
        answers = {"category": choice("info_only", 0.50), "urgent": noul(0.1), "sensitive": noul(0.1)}
        self.assertEqual(jev.route_item(answers, EMAIL, TH)[0], "low")

    def test_threshold_edges(self):
        a = {"category": choice("info_only", 0.90), "urgent": noul(0.0), "sensitive": noul(0.0)}
        self.assertEqual(jev.route_item(a, EMAIL, TH)[0], "high")
        a["category"] = choice("info_only", 0.65)
        self.assertEqual(jev.route_item(a, EMAIL, TH)[0], "medium")
        a["category"] = choice("info_only", 0.6499)
        self.assertEqual(jev.route_item(a, EMAIL, TH)[0], "low")

    def test_uncertain_label_is_always_low(self):
        answers = {"category": choice("uncertain", 0.99), "urgent": noul(0.0), "sensitive": noul(0.0)}
        route, _, flags = jev.route_item(answers, EMAIL, TH)
        self.assertEqual(route, "low")
        self.assertIn("uncertain", flags)

    def test_sensitive_caps_high_to_medium(self):
        answers = {"category": choice("needs_reply", 0.99), "urgent": noul(0.0), "sensitive": noul(0.9)}
        route, _, flags = jev.route_item(answers, EMAIL, TH)
        self.assertEqual(route, "medium")
        self.assertIn("sensitive", flags)

    def test_noul_confidence_is_distance_from_half(self):
        self.assertAlmostEqual(jev.answer_confidence(noul(0.03)), 0.97)
        self.assertAlmostEqual(jev.answer_confidence(noul(0.97)), 0.97)

    def test_draft_with_unsupported_claims_is_capped(self):
        answers = {"answers_the_message": noul(0.99), "clear_and_polite": noul(0.99), "unsupported_claims": noul(0.8)}
        route, _, flags = jev.route_item(answers, DRAFT, TH)
        self.assertEqual(route, "medium")
        self.assertIn("unsupported_claims", flags)


class RequestTests(unittest.TestCase):
    def test_build_request_truncates_and_uses_config(self):
        long_text = "x" * 20000
        body = jev.build_request(EMAIL, long_text, CONFIG)
        self.assertEqual(len(body["state"]), CONFIG["max_chars_per_item"])
        self.assertEqual(body["model"], CONFIG["model"])
        self.assertEqual(set(body["questions"]), {"category", "urgent", "sensitive"})

    def test_every_task_primary_exists_in_questions(self):
        for name, t in CONFIG["tasks"].items():
            self.assertIn(t["primary"], t["questions"], name)
            for q in t.get("cap_if_yes", []) + t.get("flag_if_yes", []):
                self.assertIn(q, t["questions"], name)
                self.assertEqual(t["questions"][q]["type"], "noul", name)

    def test_compact_answers_hides_probability_tables(self):
        out = jev.compact_answers(REAL_ANSWERS)
        self.assertEqual(out["category"], {"value": "needs_reply", "confidence": 1.0})
        self.assertEqual(out["urgent"]["value"], 0.97)


if __name__ == "__main__":
    unittest.main()
