import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Parameters, ValueSet } from 'fhir/r4';
import { firstValueFrom } from 'rxjs';
import { CodeSystems } from '../code-systems';
import { SNOMED_TO_ICD10_MAP, TerminologyClient, ValueSets } from './terminology-client';

describe('TerminologyClient', () => {
  let client: TerminologyClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(TerminologyClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the value set and the text to $expand', () => {
    client.search(ValueSets.snomedClinicalFindings, 'pneumon', 10).subscribe();

    const req = http.expectOne('/tx/ValueSet/$expand');
    expect(req.request.method).toBe('POST');
    const params = (req.request.body as Parameters).parameter!;
    expect(params.find((p) => p.name === 'valueSet')?.resource).toBe(
      ValueSets.snomedClinicalFindings,
    );
    expect(params.find((p) => p.name === 'filter')?.valueString).toBe('pneumon');
    expect(params.find((p) => p.name === 'count')?.valueInteger).toBe(10);
    req.flush({ resourceType: 'ValueSet', status: 'active' } satisfies ValueSet);
  });

  it('returns codable entries only, leaving out ICD blocks and abstract groupings', async () => {
    const result = firstValueFrom(client.search(ValueSets.icd10, 'C50'));
    http.expectOne('/tx/ValueSet/$expand').flush({
      resourceType: 'ValueSet',
      status: 'active',
      expansion: {
        timestamp: '2026-10-11',
        contains: [
          { system: CodeSystems.icd10, code: 'C50-C50', display: 'Malignant neoplasm of breast' },
          {
            system: CodeSystems.icd10,
            code: 'C50',
            display: 'Malignant neoplasm of breast',
            abstract: true,
          },
          { system: CodeSystems.icd10, code: 'C50.9', display: 'Breast, unspecified' },
          { system: CodeSystems.icd10, code: 'C50.0' }, // no display: the code stands in
        ],
      },
    } satisfies ValueSet);

    expect(await result).toEqual([
      { system: CodeSystems.icd10, code: 'C50.9', display: 'Breast, unspecified' },
      { system: CodeSystems.icd10, code: 'C50.0', display: 'C50.0' },
    ]);
  });

  describe('searching SNOMED CT by concept id', () => {
    const expanded = (contains: object[]) =>
      ({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: '2026-10-11', contains },
      }) as ValueSet;
    const validated = (result: boolean, display?: string): Parameters => ({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: result },
        ...(display ? [{ name: 'display', valueString: display }] : []),
      ],
    });

    it('looks the code up too, and lists that exact match first', async () => {
      const result = firstValueFrom(client.search(ValueSets.snomedClinicalFindings, '233604007'));

      const lookup = http.expectOne('/tx/ValueSet/$validate-code');
      const params = (lookup.request.body as Parameters).parameter!;
      expect(params.find((p) => p.name === 'code')?.valueCode).toBe('233604007');
      expect(params.find((p) => p.name === 'system')?.valueUri).toBe(CodeSystems.snomed);
      lookup.flush(validated(true, 'Pneumonia'));
      http.expectOne('/tx/ValueSet/$expand').flush(expanded([]));

      expect(await result).toEqual([
        { system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' },
      ]);
    });

    it('finds nothing extra for a code outside the value set, or when the lookup fails', async () => {
      const outside = firstValueFrom(client.search(ValueSets.snomedClinicalFindings, '76752008'));
      http.expectOne('/tx/ValueSet/$validate-code').flush(validated(false, 'Breast structure'));
      http.expectOne('/tx/ValueSet/$expand').flush(expanded([]));
      expect(await outside).toEqual([]);

      const failed = firstValueFrom(client.search(ValueSets.snomedClinicalFindings, '233604007'));
      http.expectOne('/tx/ValueSet/$validate-code').flush({}, { status: 500, statusText: 'x' });
      http
        .expectOne('/tx/ValueSet/$expand')
        .flush(expanded([{ system: CodeSystems.snomed, code: '1', display: 'by name' }]));
      expect((await failed).map((c) => c.code)).toEqual(['1']);
    });

    it("doesn't look up names, or codes of other systems", () => {
      client.search(ValueSets.snomedClinicalFindings, 'pneumonia').subscribe();
      client.search(ValueSets.icd10, '123456').subscribe();

      expect(http.match('/tx/ValueSet/$validate-code')).toHaveLength(0);
      http.match('/tx/ValueSet/$expand').forEach((req) => req.flush(expanded([])));
    });
  });

  describe('icd10ForSnomed', () => {
    const match = (
      code: string,
      display?: string,
      equivalence = 'equivalent',
      message?: string,
    ) => ({
      name: 'match',
      part: [
        { name: 'equivalence', valueCode: equivalence },
        { name: 'concept', valueCoding: { system: CodeSystems.icd10, code, display } },
        ...(message ? [{ name: 'message', valueString: message }] : []),
      ],
    });

    it("asks the official map for a concept's ICD-10 codes", async () => {
      const result = firstValueFrom(client.icd10ForSnomed('233604007'));

      const req = http.expectOne((r) => r.url === '/tx/ConceptMap/$translate');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('url')).toBe('http://snomed.info/sct?fhir_cm=447562003');
      expect(req.request.params.get('system')).toBe(CodeSystems.snomed);
      expect(req.request.params.get('code')).toBe('233604007');
      expect(req.request.params.get('targetsystem')).toBe(CodeSystems.icd10);
      req.flush({
        resourceType: 'Parameters',
        parameter: [
          { name: 'result', valueBoolean: true },
          match('J18.9', 'Pneumonia, unspecified', 'equivalent'),
          match('J18.9', 'Pneumonia, unspecified'), // a second map rule with the same target
          match('B95.3', undefined, 'relatedto', 'USE AS SECONDARY CODE TO IDENTIFY ORGANISM'),
          match('X00', undefined, 'unmatched'),
        ],
      } satisfies Parameters);

      expect(await result).toEqual([
        {
          system: CodeSystems.icd10,
          code: 'J18.9',
          display: 'Pneumonia, unspecified',
          equivalence: 'equivalent',
          advice: undefined,
        },
        {
          system: CodeSystems.icd10,
          code: 'B95.3',
          display: 'B95.3',
          equivalence: 'relatedto',
          advice: 'USE AS SECONDARY CODE TO IDENTIFY ORGANISM',
        },
      ]);
    });

    it('gives nothing when the server has no such map', async () => {
      const result = firstValueFrom(client.icd10ForSnomed('233604007'));
      http
        .expectOne((r) => r.url === '/tx/ConceptMap/$translate')
        .flush(
          { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] },
          { status: 404, statusText: 'Not Found' },
        );

      expect(await result).toEqual([]);
    });

    it('can be switched off', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: SNOMED_TO_ICD10_MAP, useValue: null },
        ],
      });
      http = TestBed.inject(HttpTestingController);

      expect(await firstValueFrom(TestBed.inject(TerminologyClient).icd10ForSnomed('1'))).toEqual(
        [],
      );
    });
  });
});
