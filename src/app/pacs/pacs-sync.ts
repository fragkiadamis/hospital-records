import { inject, Injectable } from '@angular/core';
import type { BundleEntry, Endpoint, Identifier, ImagingStudy, Patient, Reference } from 'fhir/r4';
import { firstValueFrom } from 'rxjs';
import { FhirClient } from '../fhir/client/fhir-client';
import { fhirErrorMessage } from '../fhir/client/fhir-error';
import { formatHumanName } from '../fhir/datatypes/human-name-pipe';
import { endpointDisplayName, isPacsEndpoint } from '../fhir/resources/endpoint/endpoint-mapper';
import { parseReference } from '../fhir/datatypes/reference-pipe';
import {
  imagingStudyFrom,
  patientFromStudy,
  studyUidIdentifier,
} from '../fhir/resources/imaging-study/dicom-mapper';
import { studyInstanceUid } from '../fhir/resources/imaging-study/imaging-study-mapper';
import { DICOM_PATIENT_ID_SYSTEM } from '../fhir/resources/patient/patient-mapper';
import { DicomDataset, dicomText, Tag } from './dicom-json';
import { DicomwebClient, dicomwebErrorMessage } from './dicomweb-client';

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
  /** Its patient's id, for a link to the study page; undefined if its subject is no Patient. */
  patientId?: string;
}

export interface PacsSyncReport {
  studies: StudySyncResult[];
  missingFromPacs: MissingFromPacs[];
  /**
   * Why imaging studies were not linked to the PACS Endpoint, when there should be one but it
   * isn't clear which (several active WADO-RS Endpoints), or it couldn't be looked up. Unset when
   * they were linked, or when there simply is no PACS Endpoint.
   */
  endpointWarning?: string;
  /**
   * Set when there is no PACS Endpoint at all, so imaging studies were not linked to where their
   * images are. Nothing is wrong, but it is worth knowing: a note, not a warning.
   */
  endpointNote?: string;
}

/** What one run of the sync shares between its studies. */
interface Run {
  /** Patients found or created so far, by DICOM Patient ID. */
  patients: Map<string, Reference>;
  /** The PACS Endpoint to link imaging studies to, if there is exactly one. */
  endpoint?: Reference;
}

/** How many ImagingStudies one FHIR search reads when loading them all. */
const FHIR_PAGE_SIZE = 200;

/**
 * Brings FHIR in line with the PACS. For each DICOM study, every one in Orthanc (`sync`) or only
 * the given ones (`syncStudies`, e.g. those just uploaded):
 *
 *   - its Patient is found by DICOM Patient ID (never by MRN), or created from the study;
 *   - its ImagingStudy, found by Study Instance UID, is created, or updated from the PACS when
 *     the DICOM study changed. What the app added (reasons, notes) is kept.
 *
 * ImagingStudies come only from the PACS, so after a full sync one whose DICOM study is not in
 * Orthanc is reported in `missingFromPacs` and left for a person to deal with. Running either
 * again is safe: creates are conditional, and updates are refused if the ImagingStudy changed
 * meanwhile.
 */
@Injectable({ providedIn: 'root' })
export class PacsSync {
  private readonly fhir = inject(FhirClient);
  private readonly dicomweb = inject(DicomwebClient);

  /**
   * Syncs every DICOM study in the PACS, one after the other, and reports the ImagingStudies
   * whose DICOM study is not in it. Rejects only when the PACS or FHIR can't be read at all; a
   * study that fails is reported as `failed` and the others carry on.
   */
  async sync(onProgress?: (done: number, total: number) => void): Promise<PacsSyncReport> {
    const [dicomStudies, imagingStudies] = await Promise.all([
      firstValueFrom(this.dicomweb.allStudies()).catch((err: unknown) => {
        throw new Error(dicomwebErrorMessage(err), { cause: err });
      }),
      this.allImagingStudies(),
    ]);

    const byUid = new Map<string, ImagingStudy[]>();
    for (const study of imagingStudies) {
      const uid = studyInstanceUid(study);
      byUid.set(uid, [...(byUid.get(uid) ?? []), study]);
    }

    const { endpoint, ...endpointMessages } = await this.pacsEndpoint();
    const run: Run = { patients: new Map(), endpoint };
    const studies: StudySyncResult[] = [];
    onProgress?.(0, dicomStudies.length);
    for (const dicomStudy of dicomStudies) {
      const uid = dicomText(dicomStudy, Tag.StudyInstanceUID);
      studies.push(await this.syncStudy(dicomStudy, byUid.get(uid) ?? [], run));
      onProgress?.(studies.length, dicomStudies.length);
    }

    const inPacs = new Set(dicomStudies.map((s) => dicomText(s, Tag.StudyInstanceUID)));
    const missingFromPacs = imagingStudies
      .filter((study) => !inPacs.has(studyInstanceUid(study)))
      .map((study) => {
        const subject = parseReference(study.subject);
        return {
          imagingStudyId: study.id!,
          studyInstanceUid: studyInstanceUid(study),
          patientId: subject?.type === 'Patient' ? subject.id : undefined,
        };
      });

    return { studies, missingFromPacs, ...endpointMessages };
  }

  /**
   * Syncs only the DICOM studies with these Study Instance UIDs: each is read from the PACS and
   * looked up in FHIR on its own, so the rest of the PACS is neither read nor touched. Never
   * rejects: a study the PACS doesn't have, or that can't be read, is reported as `failed`.
   * `missingFromPacs` is always empty, since that needs a full sync.
   */
  async syncStudies(
    studyInstanceUids: readonly string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<PacsSyncReport> {
    const uids = [...new Set(studyInstanceUids)];
    const { endpoint, ...endpointMessages } = await this.pacsEndpoint();
    const run: Run = { patients: new Map(), endpoint };
    const studies: StudySyncResult[] = [];
    onProgress?.(0, uids.length);
    for (const uid of uids) {
      studies.push(await this.syncOne(uid, run));
      onProgress?.(studies.length, uids.length);
    }
    return { studies, missingFromPacs: [], ...endpointMessages };
  }

  /** Reads one DICOM study and its stored ImagingStudies, then syncs it. */
  private async syncOne(uid: string, run: Run): Promise<StudySyncResult> {
    let dicomStudy: DicomDataset | undefined;
    try {
      dicomStudy = await firstValueFrom(this.dicomweb.findStudy(uid));
    } catch (err) {
      return { studyInstanceUid: uid, outcome: 'failed', reason: dicomwebErrorMessage(err) };
    }
    if (!dicomStudy) {
      return { studyInstanceUid: uid, outcome: 'failed', reason: 'The PACS does not have it.' };
    }
    try {
      const stored = await firstValueFrom(
        this.fhir.search('ImagingStudy', {
          identifier: identifierSearchValue(studyUidIdentifier(uid)),
          _count: 2,
        }),
      );
      return await this.syncStudy(dicomStudy, stored, run);
    } catch (err) {
      return { studyInstanceUid: uid, outcome: 'failed', reason: fhirErrorMessage(err) };
    }
  }

  /** Syncs one DICOM study, given the ImagingStudies stored with its Study Instance UID. */
  private async syncStudy(
    dicomStudy: DicomDataset,
    stored: ImagingStudy[],
    run: Run,
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
    if (stored.length > 1) {
      return result('skipped', {
        reason: `${stored.length} ImagingStudies have this Study Instance UID.`,
      });
    }
    const [existing] = stored;

    try {
      const [series, patient] = await Promise.all([
        firstValueFrom(this.dicomweb.searchSeries(uid)),
        this.findPatient(patientId, run.patients),
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
        const next = imagingStudyFrom(dicomStudy, series, patient, existing, run.endpoint);
        if (sameContent(existing, next)) {
          return result('unchanged', { imagingStudyId: existing.id });
        }
        const saved = await firstValueFrom(this.fhir.update(next)); // If-Match on its version
        return result('updated', { imagingStudyId: saved.id });
      }

      const created = await this.create(dicomStudy, series, patient, run.endpoint);
      run.patients.set(patientId, created.subject);
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
    endpoint: Reference | undefined,
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

    const imagingStudy = imagingStudyFrom(dicomStudy, series, subject, undefined, endpoint);
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

  /**
   * The PACS Endpoint, looked up once per run: the one active DICOMweb WADO-RS Endpoint (see
   * isPacsEndpoint). Several, or a failed lookup, come back as a warning for the report, since
   * then someone should look; none comes back as a note, since nothing is wrong.
   */
  private async pacsEndpoint(): Promise<{
    endpoint?: Reference;
    endpointWarning?: string;
    endpointNote?: string;
  }> {
    let candidates: Endpoint[];
    try {
      const active = await firstValueFrom(
        this.fhir.search('Endpoint', { status: 'active', _count: 50 }),
      );
      candidates = active.filter(isPacsEndpoint);
    } catch (err) {
      return {
        endpointWarning: `Imaging studies were not linked to the PACS endpoint: it could not be looked up (${fhirErrorMessage(err)}).`,
      };
    }
    if (candidates.length > 1) {
      return {
        endpointWarning:
          `Imaging studies were not linked to an endpoint: ${candidates.length} active DICOM ` +
          'WADO-RS endpoints, so it is not clear which is the PACS. Turn off all but one.',
      };
    }
    const [endpoint] = candidates;
    if (!endpoint) {
      return {
        endpointNote:
          'No PACS endpoint: imaging studies were not linked to where their images are. Create ' +
          'one in Endpoints (active, DICOM WADO-RS), or run npm run seed.',
      };
    }
    return {
      endpoint: { reference: `Endpoint/${endpoint.id}`, display: endpointDisplayName(endpoint) },
    };
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

/** An identifier as a token search value: "system|value". */
function identifierSearchValue(identifier: Identifier): string {
  return `${identifier.system}|${identifier.value}`;
}

/** The search that finds a resource by this identifier, for a conditional create. */
function identifierSearch(identifier: Identifier): string {
  return `identifier=${encodeURIComponent(identifierSearchValue(identifier))}`;
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
