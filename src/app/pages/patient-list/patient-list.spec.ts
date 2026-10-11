import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Bundle, OperationOutcome, Patient } from 'fhir/r4';
import { PatientList } from './patient-list';

describe('PatientList', () => {
  let fixture: ComponentFixture<PatientList>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Answers the search the page sent, then lets the page render the result. */
  const respond = async (body: object, status = 200) => {
    TestBed.tick(); // runs the resource, which sends the request
    const req = http.expectOne((r) => r.url === '/fhir/Patient');
    req.flush(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
    await fixture.whenStable();
    return req.request;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientList],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PatientList);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('lists the patients HAPI returns, sorted by name', async () => {
    const request = await respond({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Patient', id: 'p2', name: [{ family: 'Andreou' }] } },
        { resource: { resourceType: 'Patient', id: 'p1', name: [{ family: 'Kostaki' }] } },
      ],
    } satisfies Bundle<Patient>);

    expect(request.params.get('_sort')).toBe('family,given');
    expect(request.params.has('name')).toBe(false);
    const names = [...element.querySelectorAll('app-patient-summary .name')].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(['Andreou', 'Kostaki']);
    expect(element.querySelector('.footer')?.textContent).toContain('2 patients');
  });

  it('says so when there are no patients', async () => {
    await respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);

    expect(element.querySelector('.state')?.textContent).toContain('No patients yet.');
  });

  it("shows the server's error and can try again", async () => {
    await respond(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: 'Database is down' }],
      } satisfies OperationOutcome,
      500,
    );

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Database is down');

    alert?.querySelector('button')?.click();
    await respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
