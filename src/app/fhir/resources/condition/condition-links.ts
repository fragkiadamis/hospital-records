import type { Condition } from 'fhir/r4';
import { map, Observable } from 'rxjs';
import { FhirClient } from '../../client/fhir-client';
import { LinkedCount } from '../../delete-panel/delete-panel';
import { parseReference } from '../../datatypes/reference-pipe';

/**
 * ImagingStudies that name the condition as their reason (ImagingStudy.reasonReference).
 *
 * FHIR R4 has no search parameter on reasonReference, so `_revinclude=*` can't find these and
 * HAPI doesn't stop the condition from being deleted under them (tested: it answers 200 and the
 * study keeps a reference to a condition that no longer exists). The patient's studies are
 * searched by subject instead, and their reasons checked here.
 */
export function studiesWithReason(
  fhir: FhirClient,
  condition: Condition,
): Observable<LinkedCount[]> {
  const conditionId = condition.id;
  return fhir.search('ImagingStudy', { subject: condition.subject.reference, _count: 500 }).pipe(
    map((studies) => {
      const count = studies.filter((study) =>
        study.reasonReference?.some((reason) => {
          const ref = parseReference(reason);
          return ref?.type === 'Condition' && ref.id === conditionId;
        }),
      ).length;
      return count ? [{ type: 'ImagingStudy', count }] : [];
    }),
  );
}
