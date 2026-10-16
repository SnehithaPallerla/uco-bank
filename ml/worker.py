"""Bounded stdin/stdout inference worker. Labels and rule outcomes are never inputs.

Artifacts are JSON tree arrays, not executable pickle files. Node invokes this
worker with a fixed command and a private pipe; no public inference port exists.
"""
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import GroupShuffleSplit


def prepare(rows, keys, medians=None):
    x = np.array([[np.nan if r['values'].get(k) is None else r['values'][k] for k in keys] for r in rows], dtype=float)
    missing = np.isnan(x).astype(float)
    # Sign-preserving compression for long-tailed counts, hours and ratios.
    x = np.sign(x) * np.log1p(np.abs(x))
    if medians is None:
        medians = [float(np.median(x[~np.isnan(x[:, j]), j])) if np.any(~np.isnan(x[:, j])) else 0.0 for j in range(len(keys))]
    x = np.where(np.isnan(x), np.asarray(medians), x)
    return np.concatenate([x, missing], axis=1).astype(np.float32), medians


def fit(rows, keys, seed=42):
    x, medians = prepare(rows, keys)
    model = IsolationForest(n_estimators=300, max_samples=min(128, len(rows)), random_state=seed, contamination='auto', n_jobs=1).fit(x)
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        trees.append({'left': tree.children_left.tolist(), 'right': tree.children_right.tolist(), 'feature': tree.feature.tolist(), 'threshold': tree.threshold.tolist(), 'size': tree.n_node_samples.tolist()})
    return {'medians': medians, 'maxSamples': model.max_samples_, 'trees': trees}, model


def average_path(n):
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2.0 * (math.log(n - 1) + np.euler_gamma) - 2.0 * (n - 1) / n


def scores(bundle, rows, keys):
    x, _ = prepare(rows, keys, bundle['medians'])
    paths = np.zeros(len(rows))
    for tree in bundle['trees']:
        for i, values in enumerate(x):
            node, depth = 0, 0
            while tree['left'][node] != -1:
                node = tree['left'][node] if values[tree['feature'][node]] <= tree['threshold'][node] else tree['right'][node]
                depth += 1
            paths[i] += depth + average_path(tree['size'][node])
    denominator = len(bundle['trees']) * average_path(bundle['maxSamples'])
    return np.power(2.0, -paths / denominator) if denominator else np.ones(len(rows))


def unique_rows(rows):
    seen, result = set(), []
    for row in rows:
        key = json.dumps(row['values'], sort_keys=True)
        if key not in seen:
            seen.add(key)
            result.append(row)
    return result


def train(data):
    keys = data['keys']
    all_rows = [r for r in data['rows'] if r['eligible']]
    rows = unique_rows(all_rows)
    if len(rows) < 20:
        raise ValueError('At least 20 distinct eligible feature snapshots are needed for this demonstration model.')
    # Group identifiers are split metadata only, never model features.
    groups = [r.get('group', r['recordId']) for r in rows]
    if len(set(groups)) < 4:
        raise ValueError('At least four independent scenario groups are required.')
    train_idx, hold_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42).split(rows, groups=groups))
    fit_rows = [rows[i] for i in train_idx]
    held = [rows[i] for i in hold_idx]
    validation_bundle, validation_model = fit(fit_rows, keys)
    reference = scores(validation_bundle, held, keys)
    threshold = float(np.quantile(reference, 0.90))
    # Keep this model fitted only on the training groups. Holdout is for cutoff
    # selection, not an independent test or labelled accuracy measurement.
    reference_sorted = sorted(reference.tolist())
    baseline = {k: {'median': float(np.median([r['values'][k] for r in fit_rows if r['values'][k] is not None])) if any(r['values'][k] is not None for r in fit_rows) else None,
                    'q10': float(np.quantile([r['values'][k] for r in fit_rows if r['values'][k] is not None], .1)) if any(r['values'][k] is not None for r in fit_rows) else None,
                    'q90': float(np.quantile([r['values'][k] for r in fit_rows if r['values'][k] is not None], .9)) if any(r['values'][k] is not None for r in fit_rows) else None} for k in keys}
    # No independent peer forests on this tiny synthetic sample. Record peer
    # coverage and make the pooled-reference limitation explicit.
    bundle = {**validation_bundle, 'threshold': threshold, 'reference': reference_sorted, 'baseline': baseline}
    candidates = [scores(fit(fit_rows, keys, seed)[0], rows, keys) for seed in [7, 21, 42, 84, 123]]
    ranks = [np.argsort(np.argsort(v)) for v in candidates]
    correlations = [float(np.corrcoef(ranks[i], ranks[j])[0, 1]) for i in range(len(ranks)) for j in range(i)]
    top = max(1, math.ceil(.1 * len(rows)))
    top_sets = [set(np.argsort(v)[-top:].tolist()) for v in candidates]
    overlaps = [len(top_sets[i] & top_sets[j]) / len(top_sets[i] | top_sets[j]) for i in range(len(top_sets)) for j in range(i)]
    x, _ = prepare(held, keys, bundle['medians'])
    parity_error = float(np.max(np.abs(reference - (-validation_model.score_samples(x)))))
    # Group resampling tests sensitivity to the small reference population.
    group_values = sorted(set(groups[i] for i in train_idx))
    sample_scores = []
    for seed in [11, 22, 33]:
        rng = np.random.default_rng(seed)
        chosen = set(rng.choice(group_values, size=max(2, int(.8 * len(group_values))), replace=False).tolist())
        subset = [r for r in fit_rows if r.get('group', r['recordId']) in chosen]
        sample_scores.append(scores(fit(subset, keys, seed)[0], rows, keys))
    sample_ranks = [np.argsort(np.argsort(v)) for v in sample_scores]
    report = {'accuracy': None, 'precision': None, 'recall': None, 'reason': 'No independent suspicious/not-suspicious labels; synthetic demonstration data only.',
              'sourceRows': len(data['rows']), 'eligibleRows': len(all_rows), 'distinctFeatureRows': len(rows), 'trainingRows': len(fit_rows), 'calibrationRows': len(held),
              'trainingGroups': sorted(set(groups[i] for i in train_idx)), 'calibrationGroups': sorted(set(groups[i] for i in hold_idx)),
              'seedRankCorrelationMean': float(np.mean(correlations)), 'seedTopDecileJaccardMean': float(np.mean(overlaps)),
              'resampleRankCorrelationMean': float(np.mean([np.corrcoef(sample_ranks[i], sample_ranks[j])[0, 1] for i in range(3) for j in range(i)])),
              'scoringParityMaxError': parity_error, 'cutoffMethod': '90th percentile of grouped holdout anomaly scores; provisional workload setting',
              'calibrationIsIndependentTest': False, 'peerCounts': {p: sum(r['peer'] == p for r in rows) for p in sorted(set(r['peer'] for r in rows))},
              'warning': 'Pooled synthetic reference; small cohorts cannot support separate peer models or operational accuracy claims.'}
    if parity_error > 1e-10:
        raise ValueError('Portable inference disagrees with scikit-learn.')
    identity = json.dumps({'schema': data['featureVersion'], 'rows': [r['values'] for r in rows], 'groups': groups, 'algorithm': 'IsolationForest', 'seed': 42, 'trees': 300, 'sklearn': sklearn.__version__}, sort_keys=True)
    return {'modelVersion': 'IF-' + hashlib.sha256(identity.encode()).hexdigest()[:16], 'algorithm': 'IsolationForest', 'featureVersion': data['featureVersion'], 'keys': keys,
            'trainedAt': datetime.now(timezone.utc).isoformat(), 'trainingSource': data.get('source', 'Generated project catalogue'), 'scope': 'Synthetic demonstration only', 'sklearnVersion': sklearn.__version__, 'bundle': bundle, 'evaluation': report}


def predict(artifact, rows):
    eligible = [r for r in rows if r['eligible']]
    raw = scores(artifact['bundle'], eligible, artifact['keys']) if eligible else []
    score_map = {r['recordId']: float(s) for r, s in zip(eligible, raw)}
    reference = artifact['bundle']['reference']
    result = []
    for row in rows:
        s = score_map.get(row['recordId'])
        comparisons = []
        for key, baseline in artifact['bundle']['baseline'].items():
            value, median = row['values'][key], baseline['median']
            if value is None or median is None or baseline['q10'] <= value <= baseline['q90']:
                continue
            deviation = abs(math.log1p(abs(value)) - math.log1p(abs(median)))
            comparisons.append({'feature': key, 'value': value, 'referenceMedian': median, 'direction': 'higher' if value > median else 'lower', 'deviation': deviation})
        comparisons.sort(key=lambda c: c['deviation'], reverse=True)
        result.append({'recordId': row['recordId'], 'featureDigest': row['digest'], 'modelVersion': artifact['modelVersion'], 'score': s,
                       'percentile': round(100 * sum(v <= s for v in reference) / len(reference), 1) if s is not None else None,
                       'threshold': artifact['bundle']['threshold'], 'flagged': bool(s >= artifact['bundle']['threshold']) if s is not None else None,
                       'status': 'Flagged for review' if s is not None and s >= artifact['bundle']['threshold'] else 'Not flagged by model' if s is not None else 'Unable to score',
                       'comparisons': comparisons[:5], 'peer': row['peer'], 'referencePopulation': 'Pooled synthetic cases', 'reasons': row['reasons'], 'warnings': row['warnings']})
    return result


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        if sys.argv[1] == 'train':
            result = train(request)
        elif sys.argv[1] == 'score':
            artifact = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
            if request['featureVersion'] != artifact['featureVersion']:
                raise ValueError('Feature schema changed. Retrain the model.')
            result = predict(artifact, request['rows'])
        else:
            raise ValueError('Unsupported worker command')
        print(json.dumps(result, allow_nan=False, separators=(',', ':')))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
