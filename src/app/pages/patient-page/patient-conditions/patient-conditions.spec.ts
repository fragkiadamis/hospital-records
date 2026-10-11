import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Bundle, Condition } from 'fhir/r4';
import { CodeSystems } from '../../../fhir/code-systems';
import { PatientConditions } from './patient-conditions';

const subject = { reference: 'Patient/seed-patient-2' };
const condition = (
  id: string,
  status: string,
  onset?: string,
  verification?: string,
): Condition => ({
  resourceType: 'Condition',
  id,
  subject,
  code: { text: id },
  clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: status }] },
  verificationStatus: verification
    ? { coding: [{ system: CodeSystems.conditionVerification, code: verification }] }
    : undefined,
  onsetDateTime: onset,
});

describe('PatientConditions', () => {
  let fixture: ComponentFixture<PatientConditions>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Answers the page's Condition search with `conditions`. */
  const respond = async (conditions: Condition[] | null, status = 200) => {
    TestBed.tick();
    const req = http.expectOne((r) => r.url === '/fhir/Condition');
    req.flush(
      conditions
        ? ({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: conditions.map((resource) => ({ resource })),
          } satisfies Bundle<Condition>)
        : {},
      { status, statusText: 'OK' },
    );
    await fixture.whenStable();
    return req.request;
  };

  const names = () =>
    [...element.querySelectorAll('app-condition-summary .name')].map((n) => n.textContent);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientConditions],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PatientConditions);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('patientId', 'seed-patient-2');
  });

  afterEach(() => http.verify());

  it("searches the patient's conditions and lists the most relevant first", async () => {
    const request = await respond([
      condition('old-resolved', 'resolved', '2020-01-01'),
      condition('error', 'active', '2026-05-01', 'entered-in-error'),
      condition('active-no-onset', 'active'),
      condition('recent-resolved', 'resolved', '2026-01-08'),
      condition('active-old', 'active', '2019-06'),
      condition('active-new', 'relapse', '2025-02-14'),
    ]);

    expect(request.params.get('subject')).toBe('Patient/seed-patient-2');
    expect(names()).toEqual([
      'active-new',
      'active-old',
      'active-no-onset',
      'recent-resolved',
      'old-resolved',
      'error',
    ]);
    expect(element.querySelector('.count')?.textContent).toBe('6');
    expect(element.querySelector('li a')?.getAttribute('href')).toBe(
      '/patients/seed-patient-2/conditions/active-new',
    );
    expect(element.querySelector('a.add')?.getAttribute('href')).toBe(
      '/patients/seed-patient-2/conditions/new',
    );
  });

  it('says when the patient has no conditions', async () => {
    await respond([]);

    expect(element.querySelector('.state')?.textContent).toContain('No conditions recorded.');
  });

  it('shows a load error with a retry', async () => {
    await respond(null, 500);

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Conditions could not be loaded');

    alert?.querySelector('button')?.click();
    await respond([condition('c1', 'active')]);
    expect(names()).toEqual(['c1']);
  });
});
