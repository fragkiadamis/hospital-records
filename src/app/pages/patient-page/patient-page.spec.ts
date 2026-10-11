import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { Bundle, BundleEntry, FhirResource, OperationOutcome, Patient } from 'fhir/r4';
import { PatientPage } from './patient-page';

const varga: Patient = {
  resourceType: 'Patient',
  id: 'seed-patient-3',
  name: [{ family: 'Varga', given: ['Ilse'] }],
};

describe('PatientPage', () => {
  let fixture: ComponentFixture<PatientPage>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Answers the read the page sent for `id`, then lets the page render the result. */
  const respond = async (id: string, body: object, status = 200) => {
    TestBed.tick();
    http.expectOne(`/fhir/Patient/${id}`).flush(body, { status, statusText: 'OK' });
    // Rendering the patient starts the conditions card's own search (it has its own tests), and
    // the page only settles once that is answered too, so answer it with no conditions.
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
      const searches = http.match((r) => r.url === '/fhir/Condition');
      searches.forEach((req) => req.flush({ resourceType: 'Bundle', type: 'searchset' }));
      if (searches.length || status !== 200) break;
    }
    await fixture.whenStable();
  };

  const button = (text: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    );

  /** Clicks Delete and answers the linked-records check with `linked` resources. */
  const startDelete = async (linked: BundleEntry<FhirResource>[] = []) => {
    button('Delete')!.click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/fhir/Patient' && r.params.get('_revinclude') === '*')
      .flush({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: varga, search: { mode: 'match' } }, ...linked],
      } satisfies Bundle<FhirResource>);
    await fixture.whenStable();
  };

  const panelText = () =>
    element.querySelector('.delete-panel')?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PatientPage);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('reads the patient from the route id and shows it', async () => {
    fixture.componentRef.setInput('id', 'seed-patient-1');
    await respond('seed-patient-1', {
      resourceType: 'Patient',
      id: 'seed-patient-1',
      name: [{ family: 'Kostaki', given: ['Daphne'] }],
    } satisfies Patient);

    expect(element.querySelector('app-patient-detail h2')?.textContent).toBe('Daphne Kostaki');
    expect(TestBed.inject(Title).getTitle()).toBe('Daphne Kostaki · Artemis');
    expect(element.querySelector('a.back')?.getAttribute('href')).toBe('/patients');
    expect(element.querySelector('a[href$="/edit"]')?.getAttribute('href')).toBe(
      '/patients/seed-patient-1/edit',
    );
    expect(element.querySelector('app-patient-conditions')).not.toBeNull();
  });

  it('says when the patient does not exist', async () => {
    fixture.componentRef.setInput('id', 'missing');
    await respond('missing', {}, 404);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The resource was not found (HTTP 404)',
    );
    expect(button('Delete')).toBeUndefined();
  });

  describe('delete', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('id', 'seed-patient-3');
      await respond('seed-patient-3', varga);
    });

    it('deletes a patient nothing points to, after confirmation', async () => {
      await startDelete();
      expect(panelText()).toContain('Delete Ilse Varga?');

      button('Delete patient')!.click();
      const req = http.expectOne('/fhir/Patient/seed-patient-3');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(navigate).toHaveBeenCalledWith(['/patients']);
    });

    it('does not offer to delete a patient that other records point to', async () => {
      const subject = { reference: 'Patient/seed-patient-3' };
      const include = { mode: 'include' as const };
      await startDelete([
        { resource: { resourceType: 'Condition', id: 'c1', subject }, search: include },
        { resource: { resourceType: 'Condition', id: 'c2', subject }, search: include },
        {
          resource: { resourceType: 'ImagingStudy', id: 's1', status: 'available', subject },
          search: include,
        },
      ]);

      expect(panelText()).toContain("Ilse Varga can't be deleted");
      expect(panelText()).toContain('Condition (2)');
      expect(panelText()).toContain('ImagingStudy (1)');
      expect(button('Delete patient')).toBeUndefined();
    });

    it("shows the server's refusal and keeps the patient", async () => {
      await startDelete();
      button('Delete patient')!.click();
      http.expectOne('/fhir/Patient/seed-patient-3').flush(
        {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'processing', diagnostics: 'Unable to delete' }],
        } satisfies OperationOutcome,
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();

      expect(element.querySelector('.delete-panel [role="alert"]')?.textContent).toContain(
        'Unable to delete',
      );
      expect(navigate).not.toHaveBeenCalled();
    });

    it('can be called off', async () => {
      await startDelete();
      button('Keep patient')!.click();
      await fixture.whenStable();

      expect(element.querySelector('.delete-panel')).toBeNull();
    });
  });
});
