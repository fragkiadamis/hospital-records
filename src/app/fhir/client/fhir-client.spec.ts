import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Bundle, Patient } from 'fhir/r4';
import { firstValueFrom } from 'rxjs';
import { FhirClient } from './fhir-client';

describe('FhirClient', () => {
  let client: FhirClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(FhirClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify()); // fails if a test left a request unanswered

  it('searches with the given params and keeps only matches of the requested type', async () => {
    const result = firstValueFrom(client.search('Patient', { name: 'smith', gender: undefined }));

    const req = http.expectOne((r) => r.url === '/fhir/Patient');
    expect(req.request.params.get('name')).toBe('smith');
    expect(req.request.params.has('gender')).toBe(false);
    req.flush({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Patient', id: '1' }, search: { mode: 'match' } },
        { resource: { resourceType: 'Organization', id: 'o' }, search: { mode: 'include' } },
      ],
    } satisfies Bundle);

    expect((await result).map((p) => p.id)).toEqual(['1']);
  });

  it('does not send id or meta on create', () => {
    const patient: Patient = { resourceType: 'Patient', id: 'x', meta: { versionId: '3' } };
    client.create(patient).subscribe();

    const req = http.expectOne('/fhir/Patient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.id).toBeUndefined();
    expect(req.request.body.meta).toBeUndefined();
    req.flush(patient);
  });

  it('sends the version as If-Match on update', () => {
    const patient: Patient = { resourceType: 'Patient', id: '1', meta: { versionId: '3' } };
    client.update(patient).subscribe();

    const req = http.expectOne('/fhir/Patient/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('If-Match')).toBe('W/"3"');
    req.flush(patient);
  });

  it('refuses to update a resource without an id', () => {
    expect(() => client.update({ resourceType: 'Patient' })).toThrow();
  });
});
