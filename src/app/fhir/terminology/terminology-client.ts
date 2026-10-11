import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import type { Parameters, ValueSet } from 'fhir/r4';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { CodeSystems } from '../code-systems';

/**
 * Base URL of the FHIR terminology server. Relative, like FHIR_BASE_URL: the dev-server proxy
 * (proxy.conf.mjs) forwards /tx to tx.fhir.org or to TERMINOLOGY_URL, nginx in deployment.
 */
export const TERMINOLOGY_BASE_URL = new InjectionToken<string>('TERMINOLOGY_BASE_URL', {
  providedIn: 'root',
  factory: () => '/tx',
});

/** ICD-11 MMS stem codes as typed in a search: 1A00, CA40.Z, 2C6Z. */
const ICD11_CODE = /^[0-9A-Z]{4}(\.[0-9A-Z]{1,4})?$/i;

/** A code found by a search. */
export interface CodeOption {
  system: string;
  code: string;
  display: string;
}

/** The value sets the app searches, defined inline (tx.fhir.org has no stored ICD value sets). */
export const ValueSets = {
  /** All of WHO ICD-10. */
  icd10: {
    resourceType: 'ValueSet',
    status: 'active',
    compose: { include: [{ system: CodeSystems.icd10 }] },
  },
  /** All of WHO ICD-11, Mortality and Morbidity Statistics. */
  icd11: {
    resourceType: 'ValueSet',
    status: 'active',
    compose: { include: [{ system: CodeSystems.icd11 }] },
  },
} satisfies Record<string, ValueSet>;

/**
 * Searches code systems with the FHIR terminology operation ValueSet/$expand: "the codes of this
 * value set whose name or code matches the text".
 */
@Injectable({ providedIn: 'root' })
export class TerminologyClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(TERMINOLOGY_BASE_URL);

  private readonly headers = new HttpHeaders({
    Accept: 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
  });

  /**
   * Codes of the value set matching the text. tx.fhir.org matches ICD-10 codes but only ICD-11
   * names, so a text that looks like an ICD-11 code is also looked up as one; that exact match
   * comes first.
   */
  search(valueSet: ValueSet, text: string, count = 20): Observable<CodeOption[]> {
    const byName = this.expand(valueSet, text, count);
    const icd11 = valueSet.compose?.include.some((i) => i.system === CodeSystems.icd11);
    const code = text.trim().toUpperCase();
    if (!icd11 || !ICD11_CODE.test(code)) return byName;

    return forkJoin([this.lookup(valueSet, CodeSystems.icd11, code), byName]).pipe(
      map(([exact, named]) => [...exact, ...named.filter((n) => n.code !== exact[0]?.code)]),
    );
  }

  /** ValueSet/$expand with a text filter. */
  private expand(valueSet: ValueSet, text: string, count: number): Observable<CodeOption[]> {
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

  /**
   * The code itself, if it is in the value set (ValueSet/$validate-code), with its name. Empty
   * when it isn't, or when the lookup fails: the name search still runs.
   */
  private lookup(valueSet: ValueSet, system: string, code: string): Observable<CodeOption[]> {
    const parameters: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'valueSet', resource: valueSet },
        { name: 'system', valueUri: system },
        { name: 'code', valueCode: code },
      ],
    };
    return this.http
      .post<Parameters>(`${this.base}/ValueSet/$validate-code`, parameters, {
        headers: this.headers,
      })
      .pipe(
        map((result) => {
          const value = (name: string) => result.parameter?.find((p) => p.name === name);
          if (!value('result')?.valueBoolean) return [];
          return [{ system, code, display: value('display')?.valueString ?? code }];
        }),
        catchError(() => of([])),
      );
  }
}
