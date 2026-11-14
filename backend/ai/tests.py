from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from courses.models import Course

from .budget import budget_allows_llm, budget_summary, record_llm_usage
from .models import LLMUsageEvent


class BudgetTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name="Databases")

    def test_records_openrouter_usage_and_enforces_budget_limit(self):
        with patch.dict("os.environ", {"AI_BUDGET_USD": "8.00"}):
            self.assertTrue(budget_allows_llm())
            event = record_llm_usage(
                "oral_examiner",
                "test/model",
                {"usage": {"prompt_tokens": 120, "completion_tokens": 45, "cost": 0.0025}},
                course=self.course,
            )
            self.assertIsNotNone(event)
            self.assertEqual(event.input_tokens, 120)
            self.assertEqual(event.output_tokens, 45)
            self.assertEqual(event.estimated_cost_usd, Decimal("0.002500"))
            summary = budget_summary(self.course.pk)
            self.assertEqual(summary["llm_calls"], 1)
            self.assertFalse(summary["budget_exceeded"])

        with patch.dict("os.environ", {"AI_BUDGET_USD": "0.002"}):
            self.assertFalse(budget_allows_llm())
            self.assertTrue(budget_summary(self.course.pk)["budget_exceeded"])
            self.assertEqual(LLMUsageEvent.objects.count(), 1)
