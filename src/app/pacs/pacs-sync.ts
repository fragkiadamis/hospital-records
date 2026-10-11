import { inject, Injectable } from '@angular/core';
import type { BundleEntry, Identifier, ImagingStudy, Patient, Reference } from 'fhir/r4';
import { firstValueFrom } from 'rxjs';
import { FhirClient } from '../fhir/client/fhir-client';
import { fhirErrorMessage } from '../fhir/client/fhir-error';
import { formatHumanName } from '../fhir/datatypes/human-name-pipe';
import { imagingStudyFrom, patientFromStudy } from '../fhir/resources/imaging-study/dicom-mapper';
import { studyInstanceUid } from '../fhir/resources/imaging-study/imaging-study-mapper';
import { DICOM_PATIENT_ID_SYSTEM } from '../fhir/resources/patient/patient-mapper';
import { DicomDataset, dicomText, Tag } from './dicom-json';
import { DicomwebClient } from './dicomweb-client';

/** What the sync did with one DICOM study. */
export type SyncOutcome = 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';

export interface StudySyncResult {
  /** The DICOM study's Study Instance UID. */
  studyInstanceUid: string;
  outcome: SyncOutcome;
  /** The ImagingStudy the DICOM study is stored as, when there is one. */
  imagingStudyId?: string;
  /** Whether a Patient was created for it. */
  patientCreated?: boolean;
  /** Why it was skipped or failed. */
  reason?: string;
}

/** An ImagingStudy whose DICOM study is not in the PACS. Reported only, never changed. */
export interface MissingFromPacs {
  imagingStudyId: string;
  /** '' when the ImagingStudy has no Study Instance UID at all. */
  studyInstanceUid: string;
}

export interface PacsSyncReport {
  studies: StudySyncResult[];
  missingFromPacs: MissingFromPacs[];
}

/** How many ImagingStudies one FHIR search reads when loading them all. */
const FHIR_PAGE_SIZE = 200;

/**
 * Brings FHIR in line with the PACS. For every DICOM study in Orthanc:
 *
 *   - its Patient is found by DICOM Patient ID (never by MRN), or created from the study;
 *   - its ImagingStudy, found by Study Instance UID, is created, or updated from the PACS when
 *     the DICOM study changed. What the app added (reasons, notes) is kept.
 *
 * ImagingStudies come only from the PACS, so one whose DICOM study is not in Orthanc is reported
 * in `missingFromPacs` and left for a person to deal with. Running the sync again is safe:
 * creates are conditional, and updates are refused if the ImagingStudy changed meanwhile.
 */
@Injectable({ providedIn: 'root' })
export class PacsSync {
  private readonly fhir = inject(FhirClient);
  private readonly dicomweb = inject(DicomwebClient);

  /**
   * Runs the sync, one DICOM study after the other. Rejects only when the PACS or FHIR can't be
   * read at all; a study that fails is reported as `failed` and the others carry on.
   */
  async sync(onProgress?: (done: number, total: number) => void): Promise<PacsSyncReport> {
    const [dicomStudies, imagingStudies] = await Promise.all([
      firstValueFrom(this.dicomweb.allStudies()),
      this.allImagingStudies(),
    ]);

    const byUid = new Map<string, ImagingStudy[]>();
    for (const study of imagingStudies) {
      const uid = studyInstanceUid(study);
      byUid.set(uid, [...(byUid.get(uid) ?? []), study]);
    }

    // Patients found or created during this run, by DICOM Patient ID.
    const patients = new Map<string, Reference>();
    const studies: StudySyncResult[] = [];
    onProgress?.(0, dicomStudies.length);
    for (const dicomStudy of dicomStudies) {
      studies.push(await this.syncStudy(dicomStudy, byUid, patients));
      onProgress?.(studies.length, dicomStudies.length);
    }

    const inPacs = new Set(dicomStudies.map((s) => dicomText(s, Tag.StudyInstanceUID)));
    const missingFromPacs = imagingStudies
      .filter((study) => !inPacs.has(studyInstanceUid(study)))
      .map((study) => ({ imagingStudyId: study.id!, studyInstanceUid: studyInstanceUid(study) }));

    return { studies, missingFromPacs };
  }

  private async syncStudy(
    dicomStudy: DicomDataset,
    byUid: Map<string, ImagingStudy[]>,
    patients: Map<string, Reference>,
  ): Promise<StudySyncResult> {
    const uid = dicomText(dicomStudy, Tag.StudyInstanceUID);
    const patientId = dicomText(dicomStudy, Tag.PatientID);
    const result = (outcome: SyncOutcome, fields: Partial<StudySyncResult> = {}) => ({
      studyInstanceUid: uid,
      outcome,
      ...fields,
    });

    if (!uid) return result('skipped', { reason: 'The DICOM study has no Study Instance UID.' });
    if (!patientId) return result('skipped', { reason: 'The DICOM study has no Patient ID.' });
    const stored = byUid.get(uid) ?? [];
    if (stored.length > 1) {
      return result('skipped', {
        reason: `${stored.length} ImagingStudies have this Study Instance UID.`,
      });
    }
    const [existing] = stored;

    try {
      const [series, patient] = await Promise.all([
        firstValueFrom(this.dicomweb.searchSeries(uid)),
        this.findPatient(patientId, patients),
      ]);

      if (existing) {
        if (!patient || existing.subject?.reference !== patient.reference) {
          // Don't move a study between patients silently: someone has to look at this.
          return result('skipped', {
            imagingStudyId: existing.id,
            reason:
              `The ImagingStudy belongs to ${existing.subject?.reference ?? 'no patient'}, ` +
              `not to the patient with DICOM Patient ID ${patientId}.`,
          });
        }
        const next = imagingStudyFrom(dicomStudy, series, patient, existing);
        if (sameContent(existing, next)) {
          return result('unchanged', { imagingStudyId: existing.id });
        }
        const saved = await firstValueFrom(this.fhir.update(next)); // If-Match on its version
        return result('updated', { imagingStudyId: saved.id });
      }

      const created = await this.create(dicomStudy, series, patient);
      patients.set(patientId, created.subject);
      return result('created', {
        imagingStudyId: created.imagingStudyId,
        patientCreated: created.patientCreated,
      });
    } catch (err) {
      return result('failed', { imagingStudyId: existing?.id, reason: fhirErrorMessage(err) });
    }
  }

  /**
   * Creates the ImagingStudy, and its Patient when there is none yet, in one transaction. Both
   * are conditional creates, so a Patient or ImagingStudy saved since the lookup (by someone
   * else, or a second click) is used instead of being duplicated.
   */
  private async create(
    dicomStudy: DicomDataset,
    series: DicomDataset[],
    patient: Reference | undefined,
  ): Promise<{ subject: Reference; imagingStudyId?: string; patientCreated: boolean }> {
    const entries: BundleEntry[] = [];
    let subject = patient;
    if (!subject) {
      const newPatient = patientFromStudy(dicomStudy);
      const fullUrl = `urn:uuid:${crypto.randomUUID()}`;
      entries.push({
        fullUrl,
        resource: newPatient,
        request: {
          method: 'POST',
          url: 'Patient',
          ifNoneExist: identifierSearch(newPatient.identifier![0]),
        },
      });
      subject = { reference: fullUrl, display: nameOf(newPatient) };
    }

    const imagingStudy = imagingStudyFrom(dicomStudy, series, subject);
    entries.push({
      fullUrl: `urn:uuid:${crypto.randomUUID()}`,
      resource: imagingStudy,
      request: {
        method: 'POST',
        url: 'ImagingStudy',
        ifNoneExist: identifierSearch(imagingStudy.identifier![0]),
      },
    });

    const response = await firstValueFrom(this.fhir.transaction(entries));
    const results = (response.entry ?? []).map((e) => e.response);
    const studyResult = results.at(-1);
    if (patient) {
      return {
        subject: patient,
        imagingStudyId: idFrom(studyResult?.location),
        patientCreated: false,
      };
    }
    const patientResult = results[0];
    return {
      subject: {
        reference: `Patient/${idFrom(patientResult?.location)}`,
        display: subject.display,
      },
      imagingStudyId: idFrom(studyResult?.location),
      patientCreated: !!patientResult?.status?.startsWith('201'),
    };
  }

  /** The Patient with this DICOM Patient ID, from this run or from FHIR; undefined if none. */
  private async findPatient(
    patientId: string,
    patients: Map<string, Reference>,
  ): Promise<Reference | undefined> {
    const known = patients.get(patientId);
    if (known) return known;
    const found = await firstValueFrom(
      this.fhir.search('Patient', {
        identifier: `${DICOM_PATIENT_ID_SYSTEM}|${patientId}`,
        _count: 2,
      }),
    );
    if (found.length > 1) {
      throw new Error(`More than one Patient has DICOM Patient ID ${patientId}.`);
    }
    if (!found.length) return undefined;
    const reference = {
      reference: `Patient/${found[0].id}`,
      display: nameOf(found[0]),
    };
    patients.set(patientId, reference);
    return reference;
  }

  /** Every ImagingStudy in FHIR, a page at a time. */
  private async allImagingStudies(): Promise<ImagingStudy[]> {
    const all: ImagingStudy[] = [];
    for (let offset = 0; ; offset += FHIR_PAGE_SIZE) {
      const page = await firstValueFrom(
        this.fhir.search('ImagingStudy', {
          _count: FHIR_PAGE_SIZE,
          _offset: offset,
          _sort: '_id', // a stable order, so pages don't overlap
        }),
      );
      all.push(...page);
      if (page.length < FHIR_PAGE_SIZE) return all;
    }
  }
}

/** The search that finds a resource by this identifier: "system|value". */
function identifierSearch(identifier: Identifier): string {
  return `identifier=${encodeURIComponent(`${identifier.system}|${identifier.value}`)}`;
}

/** The patient's name for a reference's display; undefined for a patient without one. */
function nameOf(patient: Patient): string | undefined {
  return formatHumanName(patient.name) || undefined;
}

/** "ImagingStudy/42/_history/1" → "42". */
function idFrom(location: string | undefined): string | undefined {
  return location?.split('/')[1];
}

/** Same resource content, ignoring meta (version, lastUpdated) and the order of keys. */
function sameContent(a: ImagingStudy, b: ImagingStudy): boolean {
  return canonical({ ...a, meta: undefined }) === canonical({ ...b, meta: undefined });
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
