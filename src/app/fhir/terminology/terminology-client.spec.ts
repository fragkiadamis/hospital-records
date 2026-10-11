import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Parameters, ValueSet } from 'fhir/r4';
import { firstValueFrom } from 'rxjs';
import { CodeSystems } from '../code-systems';
import { TerminologyClient, ValueSets } from './terminology-client';

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
});
