import type { BundleEntry, Condition, FhirResource, ImagingStudy, Reference } from 'fhir/r4';
import { isReferenceTo, parseReference } from '../../datatypes/reference-pipe';
import { conditionDisplayName } from '../condition/condition-mapper';
import { imagingStudyDisplayName } from './imaging-study-mapper';

/** Ids of the conditions the study names as its reason (ImagingStudy.reasonReference). */
export function reasonConditionIds(study: ImagingStudy): string[] {
  return (study.reasonReference ?? [])
    .map(parseReference)
    .filter((ref) => ref?.type === 'Condition')
    .map((ref) => ref!.id);
}

/**
 * The transaction entries that make `selectedIds` the study's reasons, keeping both sides of the
 * link in step:
 *
 *   ImagingStudy.reasonReference  → the selected conditions (other reasons, e.g. an Observation,
 *                                   are kept)
 *   Condition.evidence.detail     → the study, on every selected condition and on no other
 *
 * Only resources that change get an entry, each a PUT with `ifMatch` on the version it was read
 * at, so the transaction fails as a whole (409/412) if any of them changed meanwhile. Empty when
 * nothing changes. `conditions` are the patient's conditions: a selected id not among them is
 * ignored.
 */
export function reasonTransaction(
  study: ImagingStudy,
  conditions: Condition[],
  selectedIds: string[],
): BundleEntry[] {
  const studyRef: Reference = {
    reference: `ImagingStudy/${study.id}`,
    display: imagingStudyDisplayName(study),
  };
  const selected = conditions.filter((c) => c.id && selectedIds.includes(c.id));
  const entries: BundleEntry[] = [];

  // The study: keep reasons that aren't conditions, and condition reasons still selected as they
  // are; add the newly selected ones.
  const current = reasonConditionIds(study);
  const kept = (study.reasonReference ?? []).filter((reason) => {
    const ref = parseReference(reason);
    return ref?.type !== 'Condition' || selected.some((c) => c.id === ref.id);
  });
  const added = selected
    .filter((c) => !current.includes(c.id!))
    .map((c) => ({ reference: `Condition/${c.id}`, display: conditionDisplayName(c) }));
  if (added.length || kept.length !== (study.reasonReference ?? []).length) {
    const reasonReference = [...kept, ...added];
    entries.push(
      put({ ...study, reasonReference: reasonReference.length ? reasonReference : undefined }),
    );
  }

  // The conditions: add the study as evidence where it is now a reason, remove it where not.
  for (const condition of conditions) {
    const isEvidence = (condition.evidence ?? []).some((e) =>
      e.detail?.some((d) => isReferenceTo(d, 'ImagingStudy', study.id)),
    );
    const shouldBe = selected.includes(condition);
    if (isEvidence === shouldBe) continue;

    const evidence = shouldBe
      ? [...(condition.evidence ?? []), { detail: [studyRef] }]
      : (condition.evidence ?? [])
          .map((e) => ({
            ...e,
            detail: e.detail?.filter((d) => !isReferenceTo(d, 'ImagingStudy', study.id)),
          }))
          .map((e) => (e.detail?.length ? e : { ...e, detail: undefined }))
          // An evidence entry left with neither codes nor details says nothing: drop it.
          .filter((e) => e.code?.length || e.detail?.length);
    entries.push(put({ ...condition, evidence: evidence.length ? evidence : undefined }));
  }

  return entries;
}

/** A transaction entry that PUTs the resource, refused if it changed since it was read. */
function put(resource: FhirResource): BundleEntry {
  const url = `${resource.resourceType}/${resource.id}`;
  const version = resource.meta?.versionId;
  return {
    fullUrl: url,
    resource,
    request: { method: 'PUT', url, ...(version ? { ifMatch: `W/"${version}"` } : {}) },
  };
}
