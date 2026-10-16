"""Weakly supervised review classifier. Targets exist only in the training pipe.

JSON inference artifacts contain numeric trees/coefficients, never executable
pickle. HGBT's pinned private tree representation is parity-tested at export.
"""
import os
for variable in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[variable] = '1'
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, precision_score, recall_score, fbeta_score
from sklearn.model_selection import StratifiedGroupKFold

PIPELINE_VERSION = 'weak-review-classifier-3-holdout'
MODEL_FAMILY = 'weak-supervised-review'


def matrix(rows, keys):
    return np.array([[np.nan if r['values'].get(k) is None else r['values'][k] for k in keys] for r in rows], dtype=float)


def preprocess_logistic(x, settings=None):
    missing = np.isnan(x).astype(float)
    x = np.sign(x) * np.log1p(np.abs(x))
    if settings is None:
        median = np.array([np.median(x[~np.isnan(x[:, j]), j]) if np.any(~np.isnan(x[:, j])) else 0.0 for j in range(x.shape[1])])
        full = np.concatenate([np.where(np.isnan(x), median, x), missing], axis=1)
        mean, scale = full.mean(axis=0), full.std(axis=0)
        scale[scale == 0] = 1.0
        settings = {'median': median.tolist(), 'mean': mean.tolist(), 'scale': scale.tolist()}
    full = np.concatenate([np.where(np.isnan(x), settings['median'], x), missing], axis=1)
    return (full - settings['mean']) / settings['scale'], settings


def select_inputs(x, y, keys, maximum=24):
    """Training-only feature screening; no names, IDs or test rows are used."""
    variance = np.var(x, axis=0)
    valid = np.flatnonzero(variance > 1e-12).tolist()
    required = {'trigger_T01', 'trigger_T02', 'trigger_T03', 'trigger_T04', 'trigger_T05', 'invoice_share', 'delivery_share', 'approval_share', 'commercial_share', 'migration_documented', 'route_approval', 'receipt_reconciled'}
    selected = [i for i in valid if i < len(keys) and keys[i] in required]
    means = [x[y == cls].mean(axis=0) for cls in (0, 1)]
    between = (means[1] - means[0]) ** 2
    within = sum(((x[y == cls] - means[cls]) ** 2).sum(axis=0) for cls in (0, 1))
    relevance = between / np.maximum(within, 1e-12)
    for i in sorted(valid, key=lambda j: (-relevance[j], j)):
        if len(selected) >= maximum:
            break
        if i in selected:
            continue
        # Avoid spending limited inputs on exact duplicate transformed columns.
        if any(np.allclose(x[:, i], x[:, j], rtol=0, atol=1e-10) for j in selected):
            continue
        selected.append(i)
    if not selected:
        raise ValueError('No varying training features are available.')
    return sorted(selected)


def fit(rows, keys, spec):
    x, y = matrix(rows, keys), np.array([r['target']['label'] for r in rows])
    transformed, settings = preprocess_logistic(x)
    selected = select_inputs(transformed, y, keys)
    settings['selected'] = selected
    transformed = transformed[:, selected]
    if spec['algorithm'] == 'HistGradientBoostingClassifier':
        model = HistGradientBoostingClassifier(learning_rate=.06, max_iter=100, max_depth=spec['depth'], max_leaf_nodes=4,
                                               min_samples_leaf=6, l2_regularization=2.0, early_stopping=False, class_weight='balanced', random_state=42).fit(transformed, y)
        trees = []
        for iteration in model._predictors:
            nodes = iteration[0].nodes
            if np.any(nodes['is_categorical']):
                raise ValueError('Categorical tree export is unsupported.')
            trees.append({key: nodes[key].tolist() for key in ('value', 'feature_idx', 'num_threshold', 'missing_go_to_left', 'left', 'right', 'is_leaf')})
        bundle = {'algorithm': spec['algorithm'], 'preprocessing': settings, 'baseline': float(model._baseline_prediction[0, 0]), 'trees': trees}
        reference = model.predict_proba(transformed)[:, 1]
    else:
        model = LogisticRegression(C=spec['C'], class_weight='balanced', max_iter=3000, random_state=42).fit(transformed, y)
        bundle = {'algorithm': 'LogisticRegression', 'preprocessing': settings, 'coefficients': model.coef_[0].tolist(), 'intercept': float(model.intercept_[0])}
        reference = model.predict_proba(transformed)[:, 1]
    error = float(np.max(np.abs(probabilities(bundle, rows, keys) - reference)))
    if error > 1e-10:
        raise ValueError('Exported inference disagrees with scikit-learn.')
    return bundle, error


def probabilities(bundle, rows, keys):
    if not rows:
        return np.array([])
    x = matrix(rows, keys)
    if 'preprocessing' in bundle:
        x, _ = preprocess_logistic(x, bundle['preprocessing'])
        x = x[:, bundle['preprocessing'].get('selected', list(range(x.shape[1])))]
    if bundle['algorithm'] == 'LogisticRegression':
        logits = x @ np.array(bundle['coefficients']) + bundle['intercept']
    else:
        logits = np.full(len(rows), bundle['baseline'])
        for tree in bundle['trees']:
            for i, values in enumerate(x):
                node = 0
                while not tree['is_leaf'][node]:
                    value = values[tree['feature_idx'][node]]
                    left = bool(tree['missing_go_to_left'][node]) if np.isnan(value) else value <= tree['num_threshold'][node]
                    node = tree['left'][node] if left else tree['right'][node]
                logits[i] += tree['value'][node]
    return 1 / (1 + np.exp(-np.clip(logits, -700, 700)))


def metrics(y, probability, threshold):
    predictions = np.asarray(probability) >= threshold
    return {'agreement': float(accuracy_score(y, predictions)), 'balancedAgreement': float(balanced_accuracy_score(y, predictions)),
            'proxyPrecision': float(precision_score(y, predictions, zero_division=0)), 'proxyRecall': float(recall_score(y, predictions, zero_division=0)),
            'proxyF2': float(fbeta_score(y, predictions, beta=2, zero_division=0)), 'confusionMatrix': confusion_matrix(y, predictions, labels=[0, 1]).tolist(), 'rows': len(y)}


def threshold_for(y, probability):
    # A fixed cutoff removes a tuning degree of freedom on this tiny catalogue.
    return .5, metrics(y, probability, .5)


def deduplicate(rows):
    signatures = {}
    for row in rows:
        key = json.dumps(row['values'], sort_keys=True)
        signatures.setdefault(key, []).append(row)
    conflicts = [group for group in signatures.values() if len(set(r['target']['label'] for r in group)) > 1]
    return [group[0] for group in signatures.values() if len(set(r['target']['label'] for r in group)) == 1], [[r['recordId'] for r in g] for g in conflicts]


def train(data):
    from grouped_evaluation import train_robust
    return train_robust(data, fit, probabilities, metrics, threshold_for, deduplicate, PIPELINE_VERSION)


def predict(artifact, rows):
    eligible = [r for r in rows if r['eligible']]
    predicted = probabilities(artifact['bundle'], eligible, artifact['keys'])
    by_id = {r['recordId']: float(s) for r, s in zip(eligible, predicted)}
    result = []
    for row in rows:
        score = by_id.get(row['recordId'])
        comparisons = []
        for key, reference in artifact['bundle']['referenceBaseline'].items():
            value, median = row['values'][key], reference['median']
            if value is None or median is None or reference['q10'] <= value <= reference['q90']:
                continue
            comparisons.append({'feature': key, 'value': value, 'referenceMedian': median, 'direction': 'higher' if value > median else 'lower'})
        result.append({'recordId': row['recordId'], 'featureDigest': row['digest'], 'modelVersion': artifact['modelVersion'], 'modelFamily': MODEL_FAMILY,
                       'algorithm': artifact['algorithm'], 'score': score, 'percentile': None, 'threshold': artifact['bundle']['threshold'],
                       'flagged': bool(score >= artifact['bundle']['threshold']) if score is not None else None,
                       'status': 'Flagged for review' if score is not None and score >= artifact['bundle']['threshold'] else 'Not flagged by model' if score is not None else 'Unable to score',
                       'activeTriggers': [k.removeprefix('trigger_') for k, v in row['values'].items() if k.startswith('trigger_') and v == 1],
                       'evidenceCoverage': {k: row['values'][k] for k in ('invoice_share', 'delivery_share', 'approval_share', 'commercial_share')},
                       'comparisons': comparisons[:5], 'peer': row['peer'], 'reasons': row['reasons'], 'warnings': row['warnings']})
    return result


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        if sys.argv[1] == 'split':
            from grouped_evaluation import make_split
            result = make_split(request, deduplicate)
        elif sys.argv[1] == 'train':
            result = train(request)
        elif sys.argv[1] == 'score':
            artifact = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
            if request['featureVersion'] != artifact['featureVersion'] or any('target' in row or row.get('policyDigest') != artifact['policyDigest'] for row in request['rows']):
                raise ValueError('Inference requires matching feature schema and must not contain proxy targets.')
            result = predict(artifact, request['rows'])
        else:
            raise ValueError('Unsupported classifier operation')
        print(json.dumps(result, allow_nan=False, separators=(',', ':')))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
