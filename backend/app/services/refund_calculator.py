"""여행 지출 기반 예상 환급액 계산"""

from __future__ import annotations

ALL = "전체"
LODGING = "숙박"
RULE_FIELDS = ("category", "min_spend", "min_nights", "max_nights",
               "cap_at_spend", "refund_value", "is_rate",
               "override_region_id", "description")


def calculate_refund(
    policies: list[dict],
    spent_by_category: dict[str, int],
    stay_duration: int,
) -> dict:
    """진행 중 제도들의 예상 환급액을 제도별로 계산해 합산한다.

    policies: crud.get_policies_for_calc 결과 (제도+규칙 행들, override 포함)
    """
    total_spent = sum(spent_by_category.values())

    # 제도별로 규칙 묶기
    by_support: dict[int, dict] = {}
    for row in policies:
        sid = row["support_id"]
        if sid not in by_support:
            by_support[sid] = {
                "title": row["support_title"],
                "max_amount": row["max_amount"],
                "is_pre_approval": row["is_pre_approval"],
                "rules": [],
            }
        by_support[sid]["rules"].append({k: row[k] for k in RULE_FIELDS})

    all_basis: list[dict] = []
    tips: list[str] = []

    for sid, sup in by_support.items():
        rules = _resolve_override(sup["rules"])
        selected = _select_rules(rules, spent_by_category, total_spent, stay_duration)
        if not selected:
            continue

        limit = sup["max_amount"] if sup["max_amount"] is not None else None
        support_refund = 0

        for rule, spent in selected:
            refund = _refund_for(rule, spent)
            if limit is not None and support_refund + refund > limit:
                refund = max(0, limit - support_refund)
            if refund <= 0:
                continue
            support_refund += refund
            all_basis.append({
                "item": sup["title"],
                "amount": refund,
                "description": rule.get("description") or "",
            })

        if support_refund > 0 and sup["is_pre_approval"]:
            tips.append(f"{sup['title']}: 여행 전 사전 신청·승인이 필요합니다.")

    tips.append("제도별 중복 적용 여부는 각 신청처에서 확인하세요.")

    return {
        "expected_refund": sum(b["amount"] for b in all_basis),
        "calculation_basis": all_basis,
        "tips": tips,
    }


def _resolve_override(rules: list[dict]) -> list[dict]:
    """같은 category에 override 규칙이 있으면 공통 규칙을 버린다."""
    has_override = {r["category"] for r in rules if r["override_region_id"] is not None}
    return [
        r for r in rules
        if r["override_region_id"] is not None or r["category"] not in has_override
    ]


def _select_rules(rules, spending, total_spent, stay_duration):
    """category별로 지출 조건을 만족하는 규칙 중 하나 선택."""
    by_cat: dict[str, list] = {}
    for rule in rules:
        spent = _matching_spend(rule, spending, total_spent, stay_duration)
        if spent is None or spent <= 0 or spent < (rule["min_spend"] or 0):
            continue
        by_cat.setdefault(rule["category"], []).append((rule, spent))

    selected = []
    for cands in by_cat.values():
        # 같은 category에 여러 구간이면 min_spend 큰 것 우선
        selected.append(max(cands, key=lambda c: c[0]["min_spend"] or 0))
    return selected


def _matching_spend(rule, spending, total_spent, stay_duration):
    """이 규칙에 해당하는 지출액. nights 조건은 숙박 category에서만."""
    cat = rule["category"]
    if cat == ALL:
        return total_spent
    if cat == LODGING:
        mn, mx = rule["min_nights"], rule["max_nights"]
        if mn is not None and stay_duration < mn:
            return None
        if mx is not None and stay_duration > mx:
            return None
        return spending.get(LODGING, 0)
    return spending.get(cat, 0)


def _refund_for(rule, spent):
    if rule["is_rate"]:
        return spent * rule["refund_value"] // 100
    return min(rule["refund_value"], spent) if rule["cap_at_spend"] else rule["refund_value"]