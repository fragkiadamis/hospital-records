import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Bundle, ImagingStudy } from 'fhir/r4';
import { PatientStudies } from './patient-studies';

const study = (id: string, started?: string, status: ImagingStudy['status'] = 'available') =>
  ({
    resourceType: 'ImagingStudy',
    id,
    status,
    subject: { reference: 'Patient/seed-patient-2' },
    description: id,
    started,
  }) satisfies ImagingStudy;

describe('PatientStudies', () => {
  let fixture: ComponentFixture<PatientStudies>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Answers the card's ImagingStudy search with `studies` (or an error). */
  const respond = async (studies: ImagingStudy[] | null, status = 200) => {
    TestBed.tick();
    const req = http.expectOne((r) => r.url === '/fhir/ImagingStudy');
    req.flush(
      studies
        ? ({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: studies.map((resource) => ({ resource })),
          } satisfies Bundle<ImagingStudy>)
        : {},
      { status, statusText: 'OK' },
    );
    await fixture.whenStable();
    return req.request;
  };

  const names = () =>
    [...element.querySelectorAll('app-imaging-study-summary .name')].map((n) => n.textContent);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientStudies],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PatientStudies);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('patientId', 'seed-patient-2');
  });

  afterEach(() => http.verify());

  it("searches the patient's studies and lists the newest first, void ones last", async () => {
    const request = await respond([
      study('ct-chest', '2026-01-08'),
      study('cancelled', '2026-06-01', 'cancelled'),
      study('xray', '2026-02-20'),
    ]);

    expect(request.params.get('subject')).toBe('Patient/seed-patient-2');
    expect(names()).toEqual(['xray', 'ct-chest', 'cancelled']);
    expect(element.querySelector('.count')?.textContent).toBe('3');
    expect(element.querySelector('.rows a')?.getAttribute('href')).toBe(
      '/patients/seed-patient-2/studies/xray',
    );
  });

  it('says when the patient has no studies', async () => {
    await respond([]);

    expect(element.querySelector('.state')?.textContent).toContain('No imaging studies.');
  });

  it('shows a load error with a retry', async () => {
    await respond(null, 500);

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Imaging studies could not be loaded');

    alert?.querySelector('button')?.click();
    await respond([study('xray', '2026-02-20')]);
    expect(names()).toEqual(['xray']);
  });
});
