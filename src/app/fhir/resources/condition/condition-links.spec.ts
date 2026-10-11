import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Bundle, Condition, ImagingStudy } from 'fhir/r4';
import { firstValueFrom } from 'rxjs';
import { FhirClient } from '../../client/fhir-client';
import { studiesWithReason } from './condition-links';

const subject = { reference: 'Patient/seed-patient-1' };
const breastCancer: Condition = { resourceType: 'Condition', id: 'seed-condition-1', subject };

const study = (id: string, ...reasons: string[]): ImagingStudy => ({
  resourceType: 'ImagingStudy',
  id,
  status: 'available',
  subject,
  reasonReference: reasons.map((reference) => ({ reference })),
});

describe('studiesWithReason', () => {
  let http: HttpTestingController;
  let fhir: FhirClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fhir = TestBed.inject(FhirClient);
  });

  afterEach(() => http.verify());

  const answer = (studies: ImagingStudy[]) => {
    const req = http.expectOne((r) => r.url === '/fhir/ImagingStudy');
    expect(req.request.params.get('subject')).toBe('Patient/seed-patient-1');
    req.flush({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: studies.map((resource) => ({ resource })),
    } satisfies Bundle<ImagingStudy>);
  };

  it("counts the patient's studies that name the condition as their reason", async () => {
    const result = firstValueFrom(studiesWithReason(fhir, breastCancer));
    answer([
      study('s1', 'Condition/seed-condition-1'),
      study('s2', 'Condition/other', 'http://x/fhir/Condition/seed-condition-1/_history/2'),
      study('s3', 'Condition/seed-condition-2'),
      study('s4'),
    ]);

    expect(await result).toEqual([{ type: 'ImagingStudy', count: 2 }]);
  });

  it('finds nothing when no study names the condition', async () => {
    const result = firstValueFrom(studiesWithReason(fhir, breastCancer));
    answer([study('s3', 'Condition/seed-condition-2')]);

    expect(await result).toEqual([]);
  });
});
