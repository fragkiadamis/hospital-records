import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Bundle, OperationOutcome, Patient } from 'fhir/r4';
import { provideRouter } from '@angular/router';
import { PacsSync, PacsSyncReport } from '../../pacs/pacs-sync';
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

  /** Stands in for PacsSync: each sync() waits until the test settles it. */
  class FakePacsSync {
    progress!: (done: number, total: number) => void;
    settle!: { resolve: (report: PacsSyncReport) => void; reject: (err: unknown) => void };

    sync(onProgress: (done: number, total: number) => void): Promise<PacsSyncReport> {
      this.progress = onProgress;
      return new Promise((resolve, reject) => (this.settle = { resolve, reject }));
    }
  }
  const pacsSync = new FakePacsSync();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PacsSync, useValue: pacsSync },
      ],
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
    const links = [...element.querySelectorAll('.list a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/patients/p2', '/patients/p1']);
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

  describe('Sync with PACS', () => {
    const syncButton = () =>
      [...element.querySelectorAll<HTMLButtonElement>('.page-header button')].find((b) =>
        /PACS|Sync/.test(b.textContent ?? ''),
      )!;

    beforeEach(() => respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle));

    it('shows progress while it runs, then the report, and reloads the list', async () => {
      expect(syncButton().textContent).toContain('Sync with PACS');

      syncButton().click();
      await fixture.whenStable();
      expect(syncButton().disabled).toBe(true);
      expect(syncButton().textContent).toContain('Reading the PACS…');

      pacsSync.progress(1, 2);
      await fixture.whenStable();
      expect(syncButton().textContent).toContain('Syncing 1 of 2…');

      pacsSync.settle.resolve({
        studies: [
          {
            studyInstanceUid: '1.1',
            outcome: 'created',
            imagingStudyId: 's1',
            patientCreated: true,
          },
          { studyInstanceUid: '1.2', outcome: 'unchanged', imagingStudyId: 's2' },
        ],
        missingFromPacs: [],
      });
      await fixture.whenStable();
      // A study was created, so there may be new patients to list.
      await respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);

      expect(syncButton().disabled).toBe(false);
      expect(syncButton().textContent).toContain('Sync with PACS');
      expect(element.querySelector('app-pacs-sync-report')?.textContent).toContain('1 created');
    });

    it('does not reload the list when nothing was created', async () => {
      syncButton().click();
      pacsSync.settle.resolve({
        studies: [{ studyInstanceUid: '1.1', outcome: 'unchanged', imagingStudyId: 's1' }],
        missingFromPacs: [],
      });
      await fixture.whenStable();

      http.expectNone((r) => r.url === '/fhir/Patient');
      expect(element.querySelector('app-pacs-sync-report')).not.toBeNull();
    });

    it('shows why the sync failed and can try again', async () => {
      syncButton().click();
      pacsSync.settle.reject(new Error('Cannot reach the PACS. Is the compose stack running?'));
      await fixture.whenStable();

      const alert = element.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('The PACS sync failed: Cannot reach the PACS.');
      expect(syncButton().disabled).toBe(false);

      alert?.querySelector('button')?.click();
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')).toBeNull();
      expect(syncButton().disabled).toBe(true);
    });
  });
});
