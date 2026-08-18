"""Scoring engine tests."""

from app.analyzers.base import fail_result, na_result, pass_result, warn_result
from app.scoring.categories import CATEGORY_WEIGHTS
from app.scoring.engine import rating_for, score_checks


def test_all_pass_is_excellent():
    checks = [
        pass_result(f"c{i}", cat, "name", "desc", 1.0)
        for i, cat in enumerate(CATEGORY_WEIGHTS)
    ]
    result = score_checks(checks)
    assert result.overall == 100.0
    assert result.rating == "EXCELLENT"


def test_all_fail_is_critical():
    checks = [
        fail_result(f"c{i}", cat, "name", "desc", 1.0, severity="CRITICAL")
        for i, cat in enumerate(CATEGORY_WEIGHTS)
    ]
    result = score_checks(checks)
    assert result.overall < 40
    assert result.rating == "CRITICAL"


def test_weighted_average():
    checks = [
        pass_result("a", "discoverability", "n", "d", weight=1.0),
        fail_result("b", "discoverability", "n", "d", weight=3.0, severity="HIGH"),
    ]
    result = score_checks(checks)
    # (100*1 + 15*3) / 4 = 36.25
    assert result.categories["discoverability"].score == 36.2
    assert result.categories["discoverability"].weight == 0.15


def test_na_checks_excluded():
    checks = [
        pass_result("a", "discoverability", "n", "d", 1.0),
        na_result("b", "discoverability", "n", "d", 1.0),
    ]
    result = score_checks(checks)
    assert result.categories["discoverability"].score == 100.0
    assert result.counts["NOT_APPLICABLE"] == 1


def test_counts():
    checks = [
        pass_result("a", "discoverability", "n", "d", 1.0),
        warn_result("b", "crawlability", "n", "d", 1.0),
        fail_result("c", "crawlability", "n", "d", 1.0),
    ]
    result = score_checks(checks)
    assert result.counts["PASS"] == 1
    assert result.counts["WARNING"] == 1
    assert result.counts["FAIL"] == 1


def test_rating_bands():
    assert rating_for(95)[0] == "EXCELLENT"
    assert rating_for(80)[0] == "GOOD"
    assert rating_for(65)[0] == "MODERATE"
    assert rating_for(45)[0] == "POOR"
    assert rating_for(20)[0] == "CRITICAL"


def test_unknown_category_ignored():
    checks = [fail_result("x", "unknown_cat", "n", "d", 1.0)]
    result = score_checks(checks)
    assert result.overall == 0.0
