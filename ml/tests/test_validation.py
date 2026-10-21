"""Офлайн-проверка балльной карты на синтетической выборке (кейс, стр. 14): различение, точность, стабильность."""
import pytest

from service.config import get_policy
from validation.run import validate


@pytest.fixture(scope="module")
def r():
    return validate(get_policy(), n=3000, seed=7)


def test_scorecard_discriminates_and_bands_are_ordered(r):
    assert r.gini > 0.35, r.gini                       # карта различает заёмщиков лучше случайной (0)
    assert 0 < r.ks <= 1
    bands = {b.name: b for b in r.bands}
    assert bands["APPROVE"].default_rate < bands["COUNTER"].default_rate < bands["REJECT"].default_rate


def test_stability_across_folds_and_halves(r):
    assert len(r.fold_ginis) == 5 and max(r.fold_ginis) - min(r.fold_ginis) < 0.2
    assert r.psi < 0.1                                  # распределение баллов стабильно между половинами выборки


def test_calibration_suggests_points_for_every_factor(r):
    assert set(r.suggested_points) == set(get_policy().factors)
    assert sum(r.suggested_points.values()) == 100
    assert r.calibrated_gini >= r.gini - 0.05


def test_deterministic_with_seed():
    a, b = validate(get_policy(), n=400, seed=1), validate(get_policy(), n=400, seed=1)
    assert (a.gini, a.ks, a.psi) == (b.gini, b.ks, b.psi)
