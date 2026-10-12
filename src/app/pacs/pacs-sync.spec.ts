import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { Bundle, BundleEntry, Endpoint, ImagingStudy, Patient } from 'fhir/r4';
import { Observable, of, throwError } from 'rxjs';
import { FhirClient, SearchParams } from '../fhir/client/fhir-client';
import { imagingStudyFrom, studyUidIdentifier } from '../fhir/resources/imaging-study/dicom-mapper';
import {
  DICOM_PATIENT_ID_SYSTEM,
  dicomPatientIdentifier,
} from '../fhir/resources/patient/patient-mapper';
import { DicomDataset, Tag } from './dicom-json';
import { DicomwebClient } from './dicomweb-client';
import { PacsSync } from './pacs-sync';

const at = (vr: string, ...Value: unknown[]) => ({ vr, Value });

const dicomStudy = (uid: string, patientId: string, description = 'CT chest'): DicomDataset => ({
  [Tag.StudyInstanceUID]: at('UI', uid),
  [Tag.PatientID]: at('LO', patientId),
  [Tag.PatientName]: at('PN', { Alphabetic: patientId }),
  [Tag.StudyDate]: at('DA', '20250210'),
  [Tag.StudyDescription]: at('LO', description),
  [Tag.ModalitiesInStudy]: at('CS', 'CT'),
});
const dicomSeries: DicomDataset[] = [
  {
    [Tag.SeriesInstanceUID]: at('UI', '9.1'),
    [Tag.SeriesNumber]: at('IS', 1),
    [Tag.Modality]: at('CS', 'CT'),
    [Tag.NumberOfSeriesRelatedInstances]: at('IS', 10),
  },
];

/** An ImagingStudy as the sync stores it for `study`, under `patientId`. */
const storedStudy = (id: string, study: DicomDataset, patientId: string): ImagingStudy => ({
  ...imagingStudyFrom(study, dicomSeries, { reference: `Patient/${patientId}` }),
  id,
  meta: { versionId: '1' },
});

/** A small in-memory FHIR server: just what the sync calls. */
class FakeFhir {
  patients: Patient[] = [];
  studies: ImagingStudy[] = [];
  transactions: BundleEntry[][] = [];
  updates: ImagingStudy[] = [];
  failTransactions = false;
  private nextId = 1;

  endpoints: Endpoint[] = [];
  failEndpointSearch = false;

  search(type: string, params: SearchParams): Observable<unknown[]> {
    if (type === 'Endpoint') {
      if (this.failEndpointSearch) return throwError(() => new HttpErrorResponse({ status: 500 }));
      return of(this.endpoints.filter((e) => !params['status'] || e.status === params['status']));
    }
    if (type === 'Patient') {
      const [system, value] = String(params['identifier']).split('|');
      return of(
        this.patients.filter((p) =>
          p.identifier?.some((i) => i.system === system && i.value === value),
        ),
      );
    }
    if (params['identifier']) {
      const [system, ...rest] = String(params['identifier']).split('|');
      const value = rest.join('|');
      return of(
        this.studies.filter((s) =>
          s.identifier?.some((i) => i.system === system && i.value === value),
        ),
      );
    }
    this.listedAll = true;
    const offset = Number(params['_offset'] ?? 0);
    return of(this.studies.slice(offset, offset + Number(params['_count'])));
  }

  /** Whether every ImagingStudy was listed, as only a full sync should. */
  listedAll = false;

  update(study: ImagingStudy): Observable<ImagingStudy> {
    this.updates.push(study);
    return of({ ...study, meta: { versionId: '2' } });
  }

  transaction(entries: BundleEntry[]): Observable<Bundle> {
    this.transactions.push(entries);
    if (this.failTransactions) {
      return throwError(() => new HttpErrorResponse({ status: 500 }));
    }
    const response = entries.map((entry) => {
      const id = `new-${this.nextId++}`;
      const resource = entry.resource!;
      if (resource.resourceType === 'Patient') this.patients.push({ ...(resource as Patient), id });
      return {
        response: { status: '201 Created', location: `${resource.resourceType}/${id}/_history/1` },
      };
    });
    return of({ resourceType: 'Bundle', type: 'transaction-response', entry: response });
  }
}

class FakeDicomweb {
  studies: DicomDataset[] = [];
  unreachable = false;
  /** Whether every study was read, as only a full sync should. */
  listedAll = false;

  allStudies(): Observable<DicomDataset[]> {
    this.listedAll = true;
    return this.unreachable
      ? throwError(() => new HttpErrorResponse({ status: 0 }))
      : of(this.studies);
  }

  findStudy(uid: string): Observable<DicomDataset | undefined> {
    if (this.unreachable) return throwError(() => new HttpErrorResponse({ status: 504 }));
    return of(this.studies.find((s) => s[Tag.StudyInstanceUID]?.Value?.[0] === uid));
  }

  searchSeries(): Observable<DicomDataset[]> {
    return of(dicomSeries);
  }
}

describe('PacsSync', () => {
  let sync: PacsSync;
  let fhir: FakeFhir;
  let pacs: FakeDicomweb;

  beforeEach(() => {
    fhir = new FakeFhir();
    pacs = new FakeDicomweb();
    TestBed.configureTestingModule({
      providers: [
        { provide: FhirClient, useValue: fhir },
        { provide: DicomwebClient, useValue: pacs },
      ],
    });
    sync = TestBed.inject(PacsSync);
  });

  it('creates the Patient and the ImagingStudy of a new DICOM study in one transaction', async () => {
    pacs.studies = [dicomStudy('1.1', 'KiTS-00136')];

    const report = await sync.sync();

    expect(report.studies).toEqual([
      {
        studyInstanceUid: '1.1',
        outcome: 'created',
        imagingStudyId: 'new-2',
        patientCreated: true,
      },
    ]);
    const [patientEntry, studyEntry] = fhir.transactions[0];
    expect(patientEntry.request).toEqual({
      method: 'POST',
      url: 'Patient',
      ifNoneExist: `identifier=${encodeURIComponent(`${DICOM_PATIENT_ID_SYSTEM}|KiTS-00136`)}`,
    });
    expect(studyEntry.request?.ifNoneExist).toBe(
      `identifier=${encodeURIComponent('urn:dicom:uid|urn:oid:1.1')}`,
    );
    // The study points at the patient created in the same transaction.
    expect((studyEntry.resource as ImagingStudy).subject.reference).toBe(patientEntry.fullUrl);
    expect(patientEntry.fullUrl).toMatch(/^urn:uuid:/);
  });

  it('files the study under the Patient that already has its DICOM Patient ID', async () => {
    fhir.patients = [
      { resourceType: 'Patient', id: 'p1', identifier: [dicomPatientIdentifier('KiTS-00136')] },
    ];
    pacs.studies = [dicomStudy('1.1', 'KiTS-00136')];

    const report = await sync.sync();

    expect(report.studies[0]).toMatchObject({ outcome: 'created', patientCreated: false });
    expect(fhir.transactions[0]).toHaveLength(1);
    expect((fhir.transactions[0][0].resource as ImagingStudy).subject.reference).toBe('Patient/p1');
  });

  it('never matches a patient by MRN', async () => {
    fhir.patients = [
      {
        resourceType: 'Patient',
        id: 'p1',
        identifier: [{ system: 'urn:hospital-records:mrn', value: 'KiTS-00136' }],
      },
    ];
    pacs.studies = [dicomStudy('1.1', 'KiTS-00136')];

    const report = await sync.sync();

    expect(report.studies[0].patientCreated).toBe(true);
  });

  it('creates one Patient for several studies of the same DICOM Patient ID', async () => {
    pacs.studies = [dicomStudy('1.1', 'KiTS-00136'), dicomStudy('1.2', 'KiTS-00136')];

    await sync.sync();

    expect(fhir.transactions.map((entries) => entries.length)).toEqual([2, 1]);
    expect((fhir.transactions[1][0].resource as ImagingStudy).subject.reference).toBe(
      'Patient/new-1',
    );
  });

  it('leaves an ImagingStudy alone when its DICOM study has not changed', async () => {
    const study = dicomStudy('1.1', 'KiTS-00136');
    fhir.patients = [
      { resourceType: 'Patient', id: 'p1', identifier: [dicomPatientIdentifier('KiTS-00136')] },
    ];
    fhir.studies = [storedStudy('s1', study, 'p1')];
    pacs.studies = [study];

    const report = await sync.sync();

    expect(report.studies[0]).toEqual({
      studyInstanceUid: '1.1',
      outcome: 'unchanged',
      imagingStudyId: 's1',
    });
    expect(fhir.updates).toEqual([]);
    expect(fhir.transactions).toEqual([]);
  });

  it('updates an ImagingStudy from the PACS and keeps the reasons set in the app', async () => {
    fhir.patients = [
      { resourceType: 'Patient', id: 'p1', identifier: [dicomPatientIdentifier('KiTS-00136')] },
    ];
    fhir.studies = [
      {
        ...storedStudy('s1', dicomStudy('1.1', 'KiTS-00136', 'old'), 'p1'),
        reasonReference: [{ reference: 'Condition/c1' }],
      },
    ];
    pacs.studies = [dicomStudy('1.1', 'KiTS-00136', 'CT chest with contrast')];

    const report = await sync.sync();

    expect(report.studies[0]).toMatchObject({ outcome: 'updated', imagingStudyId: 's1' });
    expect(fhir.updates[0].description).toBe('CT chest with contrast');
    expect(fhir.updates[0].reasonReference).toEqual([{ reference: 'Condition/c1' }]);
    expect(fhir.updates[0].meta).toEqual({ versionId: '1' }); // sent as If-Match
  });

  it('skips an ImagingStudy stored under a different patient instead of moving it', async () => {
    const study = dicomStudy('1.1', 'KiTS-00136');
    fhir.patients = [
      { resourceType: 'Patient', id: 'p1', identifier: [dicomPatientIdentifier('KiTS-00136')] },
    ];
    fhir.studies = [storedStudy('s1', study, 'someone-else')];
    pacs.studies = [study];

    const report = await sync.sync();

    expect(report.studies[0]).toMatchObject({ outcome: 'skipped', imagingStudyId: 's1' });
    expect(report.studies[0].reason).toContain('Patient/someone-else');
    expect(fhir.updates).toEqual([]);
  });

  it('skips DICOM studies it cannot file: no Patient ID, or several ImagingStudies', async () => {
    const twice = dicomStudy('1.2', 'B');
    fhir.studies = [storedStudy('s1', twice, 'p1'), storedStudy('s2', twice, 'p1')];
    pacs.studies = [dicomStudy('1.1', ''), twice];

    const report = await sync.sync();

    expect(report.studies.map((s) => [s.outcome, s.reason])).toEqual([
      ['skipped', 'The DICOM study has no Patient ID.'],
      ['skipped', '2 ImagingStudies have this Study Instance UID.'],
    ]);
  });

  it('reports a failed study with the reason and carries on with the rest', async () => {
    pacs.studies = [dicomStudy('1.1', 'A'), dicomStudy('1.2', 'B')];
    fhir.failTransactions = true;

    const report = await sync.sync();

    expect(report.studies.map((s) => s.outcome)).toEqual(['failed', 'failed']);
    expect(report.studies[0].reason).toBe('The FHIR server failed (HTTP 500)');
  });

  it('reports ImagingStudies whose DICOM study is not in the PACS, without changing them', async () => {
    fhir.studies = [
      storedStudy('s1', dicomStudy('1.9', 'A'), 'p1'),
      {
        resourceType: 'ImagingStudy',
        id: 's2',
        status: 'available',
        subject: { reference: 'Patient/p1' },
      },
    ];
    pacs.studies = [];

    const report = await sync.sync();

    expect(report.missingFromPacs).toEqual([
      { imagingStudyId: 's1', studyInstanceUid: '1.9', patientId: 'p1' },
      { imagingStudyId: 's2', studyInstanceUid: '', patientId: 'p1' },
    ]);
    expect(fhir.updates).toEqual([]);
  });

  it('reads every page of ImagingStudies', async () => {
    fhir.studies = Array.from({ length: 450 }, (_, i) => ({
      resourceType: 'ImagingStudy' as const,
      id: `s${i}`,
      status: 'available' as const,
      subject: { reference: 'Patient/p1' },
      identifier: [studyUidIdentifier(`2.${i}`)],
    }));

    const report = await sync.sync();

    expect(report.missingFromPacs).toHaveLength(450);
  });

  it('reports progress per DICOM study', async () => {
    pacs.studies = [dicomStudy('1.1', 'A'), dicomStudy('1.2', 'B')];
    const progress: [number, number][] = [];

    await sync.sync((done, total) => progress.push([done, total]));

    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('rejects when the PACS cannot be read', async () => {
    pacs.unreachable = true;

    await expect(sync.sync()).rejects.toThrow(
      'Cannot reach the PACS. Is the compose stack running?',
    );
  });

  describe('syncStudies (only the given studies)', () => {
    const patient = (id: string, dicomId: string): Patient => ({
      resourceType: 'Patient',
      id,
      identifier: [dicomPatientIdentifier(dicomId)],
    });

    it('syncs only the given studies, without reading the whole PACS or FHIR', async () => {
      pacs.studies = [dicomStudy('1.1', 'A'), dicomStudy('1.2', 'B'), dicomStudy('1.3', 'C')];

      const report = await sync.syncStudies(['1.2']);

      expect(report.studies).toEqual([
        {
          studyInstanceUid: '1.2',
          outcome: 'created',
          imagingStudyId: 'new-2',
          patientCreated: true,
        },
      ]);
      expect(fhir.transactions).toHaveLength(1);
      expect(pacs.listedAll).toBe(false);
      expect(fhir.listedAll).toBe(false);
      expect(report.missingFromPacs).toEqual([]);
    });

    it('files an uploaded study under the Patient with its DICOM Patient ID', async () => {
      fhir.patients = [patient('p1', 'KiTS-00136')];
      pacs.studies = [dicomStudy('1.1', 'KiTS-00136')];

      const report = await sync.syncStudies(['1.1']);

      expect(report.studies[0]).toMatchObject({ outcome: 'created', patientCreated: false });
      expect((fhir.transactions[0][0].resource as ImagingStudy).subject.reference).toBe(
        'Patient/p1',
      );
    });

    it('updates the ImagingStudy of a study that gained images, keeping its reasons', async () => {
      fhir.patients = [patient('p1', 'A')];
      fhir.studies = [
        {
          ...storedStudy('s1', dicomStudy('1.1', 'A', 'old'), 'p1'),
          reasonReference: [{ reference: 'Condition/c1' }],
        },
      ];
      pacs.studies = [dicomStudy('1.1', 'A', 'new')];

      const report = await sync.syncStudies(['1.1']);

      expect(report.studies[0]).toMatchObject({ outcome: 'updated', imagingStudyId: 's1' });
      expect(fhir.updates[0].reasonReference).toEqual([{ reference: 'Condition/c1' }]);
    });

    it('says unchanged when the study was already there as it is', async () => {
      const study = dicomStudy('1.1', 'A');
      fhir.patients = [patient('p1', 'A')];
      fhir.studies = [storedStudy('s1', study, 'p1')];
      pacs.studies = [study];

      const report = await sync.syncStudies(['1.1']);

      expect(report.studies[0]).toMatchObject({ outcome: 'unchanged', imagingStudyId: 's1' });
    });

    it('creates one Patient for several studies of the same DICOM Patient ID, each once', async () => {
      pacs.studies = [dicomStudy('1.1', 'A'), dicomStudy('1.2', 'A')];

      const report = await sync.syncStudies(['1.1', '1.2', '1.1']);

      expect(report.studies.map((s) => s.studyInstanceUid)).toEqual(['1.1', '1.2']);
      expect(fhir.transactions.map((entries) => entries.length)).toEqual([2, 1]);
    });

    it('reports a study the PACS does not have, and carries on', async () => {
      pacs.studies = [dicomStudy('1.2', 'B')];

      const report = await sync.syncStudies(['9.9', '1.2']);

      expect(report.studies.map((s) => [s.outcome, s.reason])).toEqual([
        ['failed', 'The PACS does not have it.'],
        ['created', undefined],
      ]);
    });

    it('reports a PACS that cannot be read per study instead of rejecting', async () => {
      pacs.unreachable = true;

      const report = await sync.syncStudies(['1.1']);

      expect(report.studies[0]).toEqual({
        studyInstanceUid: '1.1',
        outcome: 'failed',
        reason: 'Cannot reach the PACS. Is the compose stack running?',
      });
    });

    it('reports progress per study', async () => {
      pacs.studies = [dicomStudy('1.1', 'A'), dicomStudy('1.2', 'B')];
      const progress: [number, number][] = [];

      await sync.syncStudies(['1.1', '1.2'], (done, total) => progress.push([done, total]));

      expect(progress).toEqual([
        [0, 2],
        [1, 2],
        [2, 2],
      ]);
    });
  });

  describe('the PACS Endpoint', () => {
    const endpoint = (id: string, changes: Partial<Endpoint> = {}): Endpoint => ({
      resourceType: 'Endpoint',
      id,
      name: `PACS ${id}`,
      status: 'active',
      connectionType: {
        system: 'http://terminology.hl7.org/CodeSystem/endpoint-connection-type',
        code: 'dicom-wado-rs',
      },
      payloadType: [{ text: 'DICOM' }],
      address: `http://${id}/dicom-web`,
      ...changes,
    });
    const created = () => fhir.transactions.at(-1)!.at(-1)!.resource as ImagingStudy;

    it('links new imaging studies to the one active WADO-RS endpoint', async () => {
      fhir.endpoints = [
        endpoint('pacs'),
        endpoint('off', { status: 'off' }),
        endpoint('fhir', { connectionType: { code: 'hl7-fhir-rest' } }),
      ];
      pacs.studies = [dicomStudy('1.1', 'A')];

      const report = await sync.sync();

      expect(created().endpoint).toEqual([{ reference: 'Endpoint/pacs', display: 'PACS pacs' }]);
      expect(report.endpointWarning).toBeUndefined();
    });

    it('links a study synced before there was an endpoint on its next sync, once', async () => {
      const study = dicomStudy('1.1', 'A');
      fhir.patients = [
        { resourceType: 'Patient', id: 'p1', identifier: [dicomPatientIdentifier('A')] },
      ];
      fhir.studies = [storedStudy('s1', study, 'p1')];
      fhir.endpoints = [endpoint('pacs')];
      pacs.studies = [study];

      const first = await sync.sync();
      expect(first.studies[0].outcome).toBe('updated');
      expect(fhir.updates[0].endpoint).toEqual([
        { reference: 'Endpoint/pacs', display: 'PACS pacs' },
      ]);

      fhir.studies = [{ ...fhir.updates[0], meta: { versionId: '2' } }];
      const second = await sync.sync();
      expect(second.studies[0].outcome).toBe('unchanged');
    });

    it('links nothing, without a warning, when there is no PACS endpoint', async () => {
      pacs.studies = [dicomStudy('1.1', 'A')];

      const report = await sync.sync();

      expect('endpoint' in created()).toBe(false);
      expect(report.endpointWarning).toBeUndefined();
    });

    it('links nothing, and says why, when several endpoints could be the PACS', async () => {
      fhir.endpoints = [endpoint('a'), endpoint('b')];
      pacs.studies = [dicomStudy('1.1', 'A')];

      const report = await sync.sync();

      expect('endpoint' in created()).toBe(false);
      expect(report.endpointWarning).toContain('2 active DICOM WADO-RS endpoints');
    });

    it('keeps a stored link when it is not clear which endpoint is the PACS', async () => {
      const study = dicomStudy('1.1', 'A');
      const linked = { ...storedStudy('s1', study, 'p1'), endpoint: [{ reference: 'Endpoint/a' }] };
      fhir.patients = [
        { resourceType: 'Patient', id: 'p1', identifier: [dicomPatientIdentifier('A')] },
      ];
      fhir.studies = [linked];
      fhir.endpoints = [endpoint('a'), endpoint('b')];
      pacs.studies = [study];

      const report = await sync.sync();

      expect(report.studies[0].outcome).toBe('unchanged');
    });

    it('says when the endpoint could not be looked up, and still syncs', async () => {
      fhir.failEndpointSearch = true;
      pacs.studies = [dicomStudy('1.1', 'A')];

      const report = await sync.sync();

      expect(report.studies[0].outcome).toBe('created');
      expect(report.endpointWarning).toContain('could not be looked up');
    });

    it('links the studies of an import too', async () => {
      fhir.endpoints = [endpoint('pacs')];
      pacs.studies = [dicomStudy('1.1', 'A')];

      await sync.syncStudies(['1.1']);

      expect(created().endpoint).toEqual([{ reference: 'Endpoint/pacs', display: 'PACS pacs' }]);
    });
  });
});
