import logging
import os
from decimal import Decimal, InvalidOperation

from django.db.models import Sum
from django.db.utils import OperationalError, ProgrammingError

from transcription.models import AIUsageEvent as STTUsageEvent

from .models import LLMUsageEvent

logger = logging.getLogger(__name__)
FALLBACK_USD_PER_TOKEN = Decimal("0.0000015")


def budget_limit_usd():
    raw = os.environ.get("AI_BUDGET_USD", "8")
    try:
        value = Decimal(str(raw))
        return value if value.is_finite() and value >= 0 else Decimal("8")
    except InvalidOperation:
        return Decimal("8")


def spent_totals(course_id=None):
    try:
        stt_total = STTUsageEvent.objects.aggregate(total=Sum("estimated_cost_usd"))["total"] or Decimal("0")
        llm_total = LLMUsageEvent.objects.aggregate(total=Sum("estimated_cost_usd"))["total"] or Decimal("0")
        stt_calls = STTUsageEvent.objects.count()
        llm_calls = LLMUsageEvent.objects.count()
        course_llm = Decimal("0")
        course_stt = Decimal("0")
        if course_id is not None:
            course_llm = (
                LLMUsageEvent.objects.filter(course_id=course_id).aggregate(total=Sum("estimated_cost_usd"))["total"]
                or Decimal("0")
            )
            course_stt = (
                STTUsageEvent.objects.filter(job__course_id=course_id).aggregate(total=Sum("estimated_cost_usd"))["total"]
                or Decimal("0")
            )
    except (OperationalError, ProgrammingError):
        return Decimal("0"), Decimal("0"), 0, 0
    return stt_total + llm_total, course_stt + course_llm, stt_calls, llm_calls


def budget_allows_llm():
    spent, _, _, _ = spent_totals()
    return spent < budget_limit_usd()


def budget_summary(course_id=None):
    limit = budget_limit_usd()
    spent, course_spent, stt_calls, llm_calls = spent_totals(course_id)
    remaining = max(Decimal("0"), limit - spent)
    return {
        "spent_usd": float(round(spent, 4)),
        "course_spent_usd": float(round(course_spent, 4)),
        "budget_usd": float(round(limit, 2)),
        "remaining_usd": float(round(remaining, 4)),
        "stt_calls": stt_calls,
        "llm_calls": llm_calls,
        "budget_exceeded": spent >= limit,
    }


def _safe_int(value):
    return value if type(value) is int and value >= 0 else 0


def record_llm_usage(task, model, payload, course=None):
    if not isinstance(payload, dict):
        return None
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    in_tokens = _safe_int(usage.get("prompt_tokens"))
    out_tokens = _safe_int(usage.get("completion_tokens"))
    raw_cost = usage.get("cost")
    cost = None
    if raw_cost is not None:
        try:
            parsed = Decimal(str(raw_cost))
            if parsed.is_finite() and parsed >= 0:
                cost = parsed
        except (InvalidOperation, ValueError):
            cost = None
    if cost is None:
        cost = Decimal(in_tokens + out_tokens) * FALLBACK_USD_PER_TOKEN
    try:
        return LLMUsageEvent.objects.create(
            course=course,
            task=str(task)[:40],
            model=str(model or "unknown")[:120],
            input_tokens=in_tokens,
            output_tokens=out_tokens,
            estimated_cost_usd=cost.quantize(Decimal("0.000001")),
        )
    except (OperationalError, ProgrammingError):
        logger.debug("Skipping LLM usage recording because ai tables are not migrated yet.")
        return None
