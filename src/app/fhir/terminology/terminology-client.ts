import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import type { Parameters, ValueSet } from 'fhir/r4';
import { map, Observable } from 'rxjs';
import { CodeSystems } from '../code-systems';

/**
 * Base URL of the FHIR terminology server. Relative, like FHIR_BASE_URL: the dev-server proxy
 * (proxy.conf.mjs) forwards /tx to tx.fhir.org or to TERMINOLOGY_URL, nginx in deployment.
 */
export const TERMINOLOGY_BASE_URL = new InjectionToken<string>('TERMINOLOGY_BASE_URL', {
  providedIn: 'root',
  factory: () => '/tx',
});

/** A code found by a search. */
export interface CodeOption {
  system: string;
  code: string;
  display: string;
}

/** The value sets the app searches, defined inline (tx.fhir.org has no stored ICD-10 value set). */
export const ValueSets = {
  /** SNOMED CT clinical findings: 404684003 and everything below it (disorders, findings…). */
  snomedClinicalFindings: {
    resourceType: 'ValueSet',
    status: 'active',
    compose: {
      include: [
        {
          system: CodeSystems.snomed,
          filter: [{ property: 'concept', op: 'is-a', value: '404684003' }],
        },
      ],
    },
  },
  /** All of WHO ICD-10. */
  icd10: {
    resourceType: 'ValueSet',
    status: 'active',
    compose: { include: [{ system: CodeSystems.icd10 }] },
  },
} satisfies Record<string, ValueSet>;

/**
 * Searches code systems with the FHIR terminology operation ValueSet/$expand: "the codes of this
 * value set whose name (or code) matches the text".
 */
@Injectable({ providedIn: 'root' })
export class TerminologyClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(TERMINOLOGY_BASE_URL);

  private readonly headers = new HttpHeaders({
    Accept: 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
  });

  search(valueSet: ValueSet, text: string, count = 20): Observable<CodeOption[]> {
    const parameters: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'valueSet', resource: valueSet },
        { name: 'filter', valueString: text },
        { name: 'count', valueInteger: count },
      ],
    };
    return this.http
      .post<ValueSet>(`${this.base}/ValueSet/$expand`, parameters, { headers: this.headers })
      .pipe(
        map((expanded) =>
          (expanded.expansion?.contains ?? [])
            // Abstract entries and ICD block ranges ("C50-C50") group codes; they can't be coded.
            .filter((c) => c.code && c.system && !c.abstract && !c.code.includes('-'))
            .map((c) => ({ system: c.system!, code: c.code!, display: c.display ?? c.code! })),
        ),
      );
  }
}
