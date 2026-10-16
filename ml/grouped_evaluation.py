"""Fixed grouped holdout; preprocessing, selection and fitting use training only."""
import hashlib
import json
from datetime import datetime, timezone
import numpy as np
import sklearn
from sklearn.metrics import balanced_accuracy_score
from sklearn.model_selection import StratifiedGroupKFold

SPLIT_VERSION = 'fixed-group-holdout-1'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def merge_duplicate_groups(rows):
    parent = {r['group']: r['group'] for r in rows}
    def root(group):
        while parent[group] != group:
            group = parent[group]
        return group
    signatures = {}
    for row in rows:
        signature = json.dumps(row['values'], sort_keys=True)
        if signature in signatures:
            a, b = root(row['group']), root(signatures[signature])
            parent[max(a, b)] = min(a, b)
        else:
            signatures[signature] = row['group']
    return [{**r, 'group': root(r['group'])} for r in rows]


def eligible_rows(data):
    return merge_duplicate_groups([r for r in data['rows'] if r['eligible'] and r['target']['label'] is not None])


def dataset_digest(rows):
    return digest([{'recordId': r['recordId'], 'group': r['group'], 'values': r['values']} for r in rows])


def make_split(data, deduplicate):
    eligible = eligible_rows(data)
    rows, conflicts = deduplicate(eligible)
    if conflicts or len(rows) < 20 or len(set(r['group'] for r in rows)) < 8:
        raise ValueError('Need unambiguous features, 20 distinct rows and eight scenario groups for holdout training.')
    labels = np.array([r['target']['label'] for r in rows])
    groups = np.array([r['group'] for r in rows])
    # Choose the first fold once, before fitting. Never search seeds/folds for a better score.
    training, testing = next(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42).split(rows, labels, groups))
    train_groups, test_groups = set(groups[training]), set(groups[testing])
    scored_ids = {r['recordId'] for r in eligible}
    return {'version': SPLIT_VERSION, 'seed': 42, 'testFold': 0, 'targetTestFraction': .2,
            'datasetDigest': dataset_digest(eligible),
            'trainingGroups': sorted(train_groups), 'testGroups': sorted(test_groups),
            'trainingRecordIds': [r['recordId'] for r in eligible if r['group'] in train_groups],
            'testRecordIds': [r['recordId'] for r in eligible if r['group'] in test_groups],
            'unscoredRecordIds': [r['recordId'] for r in data['rows'] if r['recordId'] not in scored_ids],
            'limitation': 'Internal holdout from previously used development data, not a fresh independent dataset.'}


def validate_split(split, eligible):
    if split.get('version') != SPLIT_VERSION or split.get('datasetDigest') != dataset_digest(eligible):
        raise ValueError('Frozen holdout does not match this dataset. Deliberately define a new evaluation dataset/split before retraining.')
    training, testing = set(split['trainingGroups']), set(split['testGroups'])
    if not training or not testing or training & testing or training | testing != {r['group'] for r in eligible}:
        raise ValueError('Invalid or overlapping holdout scenario groups.')
    for key, groups in [('trainingRecordIds', training), ('testRecordIds', testing)]:
        if split[key] != [r['recordId'] for r in eligible if r['group'] in groups]:
            raise ValueError('Frozen holdout case assignments do not match their scenario groups.')
    return training, testing


def train_robust(data, fit, probability, metrics, threshold_for, deduplicate, pipeline_version):
    keys, eligible = data['keys'], eligible_rows(data)
    split = data.get('holdoutSplit')
    if not split:
        raise ValueError('Create and save the fixed holdout split before training.')
    train_groups, test_groups = validate_split(split, eligible)
    training_cases = [r for r in eligible if r['group'] in train_groups]
    test_cases = [r for r in eligible if r['group'] in test_groups]
    training, conflicts = deduplicate(training_cases)
    testing, test_conflicts = deduplicate(test_cases)
    if conflicts or test_conflicts:
        raise ValueError('Conflicting proxy targets share identical features.')
    y = np.array([r['target']['label'] for r in training])
    group_ids = np.array([r['group'] for r in training])
    folds = list(StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=84).split(training, y, group_ids))
    specs = [{'algorithm': 'LogisticRegression', 'C': c} for c in (.25, .5)] + [
        {'algorithm': 'HistGradientBoostingClassifier', 'depth': depth} for depth in (1, 2)]
    parity, candidates, candidate_scores, tuning_audit = [0.0], [], [], []

    def fitted(subset, specification):
        if any(r['group'] not in train_groups for r in subset):
            raise ValueError('A reserved test group reached model fitting.')
        model, error = fit(subset, keys, specification)
        parity[0] = max(parity[0], error)
        return model

    for fold, (fit_index, valid_index) in enumerate(folds):
        if set(group_ids[fit_index]) & set(group_ids[valid_index]):
            raise ValueError('Scenario leakage in training-only validation.')
        tuning_audit.append({'fold': fold + 1, 'trainingRecordIds': [training[i]['recordId'] for i in fit_index],
                             'validationRecordIds': [training[i]['recordId'] for i in valid_index]})
    for specification in specs:
        oof = np.zeros(len(training))
        for fit_index, valid_index in folds:
            model = fitted([training[i] for i in fit_index], specification)
            oof[valid_index] = probability(model, [training[i] for i in valid_index], keys)
        threshold, evaluated = threshold_for(y, oof)
        balanced = [float(balanced_accuracy_score(y[index], oof[index] >= threshold)) for _, index in folds]
        candidates.append({'specification': specification, 'threshold': threshold, 'groupedValidation': evaluated,
                           'meanFoldBalancedAgreement': float(np.mean(balanced)),
                           'standardErrorFoldBalancedAgreement': float(np.std(balanced, ddof=1) / np.sqrt(len(folds)))})
        candidate_scores.append(oof)
    best = max(candidates, key=lambda c: c['meanFoldBalancedAgreement'])
    near = [c for c in candidates if c['meanFoldBalancedAgreement'] >= best['meanFoldBalancedAgreement'] - best['standardErrorFoldBalancedAgreement']]
    def simplicity(candidate):
        specification = candidate['specification']
        return (0, specification['C']) if specification['algorithm'] == 'LogisticRegression' else (1, specification['depth'])
    winner = min(near, key=simplicity)
    final_bundle = fitted(training, winner['specification'])
    baseline = {}
    for key in keys:
        values = [r['values'][key] for r in training if r['values'][key] is not None]
        baseline[key] = {'median': float(np.median(values)) if values else None,
                         'q10': float(np.quantile(values, .1)) if values else None,
                         'q90': float(np.quantile(values, .9)) if values else None}
    final_bundle.update({'threshold': .5, 'referenceBaseline': baseline})

    # Freeze the fitted bundle before evaluating test labels. No test-driven refit or activation gate.
    bundle_digest = digest(final_bundle)
    def evaluate(cases):
        return metrics(np.array([r['target']['label'] for r in cases]), probability(final_bundle, cases, keys), .5)
    holdout = {'allScoreableCases': evaluate(test_cases), 'uniqueRows': evaluate(testing)}
    training_fit = {'allScoreableCases': evaluate(training_cases), 'uniqueRows': evaluate(training)}
    scores = probability(final_bundle, test_cases, keys)
    held_predictions = [{'recordId': r['recordId'], 'group': r['group'], 'score': float(s), 'threshold': .5,
                         'flagged': bool(s >= .5), 'proxyTarget': r['target']['label']} for r, s in zip(test_cases, scores)]
    input_names = keys + ['missing:' + key for key in keys]
    selected_names = [input_names[i] for i in final_bundle['preprocessing']['selected']]
    validation_scores = candidate_scores[next(i for i, c in enumerate(candidates) if c is winner)]
    report = {'protocol': SPLIT_VERSION, 'accuracy': None, 'precision': None, 'recall': None,
              'reason': 'Agreement with provisional rule-derived review targets; independent suspicious-activity accuracy is not established.',
              'sourceRows': len(data['rows']), 'eligibleRows': len(eligible), 'unscoredRows': len(data['rows']) - len(eligible),
              'distinctFeatureRows': len(training) + len(testing), 'trainingRows': len(training), 'testRows': len(testing),
              'trainingCases': len(training_cases), 'testCases': len(test_cases),
              'trainingGroups': sorted(train_groups), 'testGroups': sorted(test_groups), 'targetMapping': data['targetMapping'],
              'conflictingFeatureTargets': [], 'candidates': candidates, 'selected': winner,
              'holdoutEvaluation': holdout, 'trainingFit': training_fit, 'trainingValidation': winner['groupedValidation'],
              'generalizationGap': {'trainMinusTest': training_fit['allScoreableCases']['agreement'] - holdout['allScoreableCases']['agreement']},
              'fullCatalogueAgreement': evaluate(eligible), 'scoringParityMaxError': parity[0],
              'selectedInputCount': len(selected_names), 'selectedInputs': selected_names,
              'splitDigest': digest(split), 'deploymentBundleDigest': bundle_digest, 'groupLeakageCount': 0,
              'cutoffMethod': 'Fixed 0.5. Three-fold grouped validation selects configuration using training data only; test groups never select preprocessing, features, model or cutoff.',
              'deploymentFit': 'Deployed weights and reference statistics are fitted only on the frozen training partition. Reserved test cases are never used in a refit.',
              'warning': 'A split helps measure generalization; it does not prevent overfitting by itself. This is a small, previously used synthetic development dataset with rule-derived labels.',
              'holdoutLimitation': split['limitation']}
    identity = {'pipeline': pipeline_version, 'features': data['featureVersion'], 'policy': data['policyDigest'], 'keys': keys,
                'training': [{'values': r['values'], 'label': r['target']['label'], 'group': r['group']} for r in training],
                'splitDigest': digest(split), 'specification': winner['specification'], 'bundle': final_bundle, 'sklearn': sklearn.__version__}
    return {'modelVersion': 'WS-' + digest(identity)[:16], 'modelFamily': 'weak-supervised-review', 'pipelineVersion': pipeline_version,
            'algorithm': winner['specification']['algorithm'], 'featureVersion': data['featureVersion'], 'policyDigest': data['policyDigest'], 'keys': keys,
            'trainedAt': datetime.now(timezone.utc).isoformat(), 'trainingSource': data['source'], 'scope': 'Weakly supervised synthetic demonstration', 'sklearnVersion': sklearn.__version__,
            'bundle': final_bundle, 'evaluation': report, 'holdoutSplit': split,
            'fitRecordIds': [r['recordId'] for r in training], 'holdoutPredictions': held_predictions, 'tuningAudit': tuning_audit,
            'trainingValidationPredictions': [{'recordId': r['recordId'], 'group': r['group'], 'score': float(s), 'proxyTarget': r['target']['label']} for r, s in zip(training, validation_scores)],
            'trainingTargets': [{'recordId': r['recordId'], **r['target']} for r in training_cases]}
