import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Bundle, OperationOutcome, Patient } from 'fhir/r4';
import { provideRouter } from '@angular/router';
import { dicomPatientIdentifier } from '../../fhir/resources/patient/patient-mapper';
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

  describe('search', () => {
    const bundle = (...patients: Patient[]): Bundle<Patient> => ({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: patients.map((resource) => ({ resource })),
    });
    const named: Patient = { resourceType: 'Patient', id: 'p1', name: [{ family: 'Lidcombe' }] };
    const unnamed: Patient = {
      resourceType: 'Patient',
      id: 'p9',
      identifier: [dicomPatientIdentifier('LIDC-IDRI-0580')],
    };

    /** Types `term`, waits for the search to start, and returns the requests it sent. */
    const type = async (term: string) => {
      const search = element.querySelector<HTMLInputElement>('input[type="search"]')!;
      search.value = term;
      search.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350)); // waits for typing to pause
      TestBed.tick();
      return http.match((r) => r.url === '/fhir/Patient');
    };
    const searchIn = async (value: string) => {
      const select = element.querySelector<HTMLSelectElement>('select')!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const listed = () =>
      [...element.querySelectorAll('.list a')].map((a) => a.getAttribute('href'));

    beforeEach(() => respond(bundle()));

    it('offers All, Name and every kind of patient identifier', () => {
      const options = [...element.querySelectorAll('select option')].map((o) => o.textContent);
      expect(options).toEqual(['All', 'Name', 'MRN', 'DICOM Patient ID']);
    });

    it('searches names and any identifier by default, listing each patient once', async () => {
      const requests = await type('lidc');

      expect(
        requests.map((r) => [...r.request.params.keys()].find((k) => !k.startsWith('_'))),
      ).toEqual(['name:contains', 'identifier-value:contains']);
      requests[0].flush(bundle(named));
      requests[1].flush(bundle(unnamed, named)); // p1 is found both ways
      await fixture.whenStable();

      expect(listed()).toEqual(['/patients/p1', '/patients/p9']);
      // The unnamed patient goes by its DICOM Patient ID.
      expect(element.querySelectorAll('app-patient-summary .name')[1].textContent).toBe(
        'LIDC-IDRI-0580',
      );
    });

    it('searches one kind of identifier when chosen', async () => {
      await searchIn('mrn');
      expect(element.querySelector('input')?.getAttribute('placeholder')).toBe('Search by MRN');

      const requests = await type('seed');

      expect(requests).toHaveLength(1);
      expect(requests[0].request.params.get('mrn:contains')).toBe('seed');
      expect(requests[0].request.params.has('name:contains')).toBe(false);
      requests[0].flush(bundle(named));
      await fixture.whenStable();
      expect(listed()).toEqual(['/patients/p1']);
    });

    it('searches names only when chosen', async () => {
      await searchIn('name');

      const requests = await type('kost');

      expect(requests).toHaveLength(1);
      expect(requests[0].request.params.get('name:contains')).toBe('kost');
      requests[0].flush(bundle());
      await fixture.whenStable();
    });
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

  it('opens the DICOM import from the header', async () => {
    await respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);
    const importButton = [
      ...element.querySelectorAll<HTMLButtonElement>('.page-header button'),
    ].find((b) => b.textContent?.includes('Import DICOM'))!;
    expect(element.querySelector('#import-heading')).toBeNull();

    importButton.click();
    await fixture.whenStable();

    expect(element.querySelector('#import-heading')?.textContent).toContain('Import DICOM');
    expect(importButton.disabled).toBe(true);
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
