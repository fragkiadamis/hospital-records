import type {
  Coding,
  HumanName,
  Identifier,
  ImagingStudy,
  ImagingStudySeries,
  Patient,
  Reference,
} from 'fhir/r4';
import { dicomNumber, DicomDataset, dicomText, dicomValues, Tag } from '../../../pacs/dicom-json';
import { CodeSystems } from '../../code-systems';
import { dicomPatientIdentifier } from '../patient/patient-mapper';

// DICOM (as QIDO-RS returns it) → FHIR R4 Patient and ImagingStudy. No I/O: the PACS sync
// fetches and saves, these only convert.

/** DICOM DA "20250210" → FHIR date "2025-02-10"; '' when missing or malformed. */
export function fhirDate(da: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(da);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * DICOM DA + TM → FHIR dateTime. FHIR requires a time zone whenever there is a time, and DICOM
 * often doesn't say which (TimezoneOffsetFromUTC is optional). Without an offset only the date
 * is kept, rather than guessing the zone and showing a wrong time.
 */
export function fhirDateTime(da: string, tm: string, offset: string): string | undefined {
  const date = fhirDate(da);
  const time = /^(\d{2})(\d{2})?(\d{2})?/.exec(tm);
  const zone = /^([+-])(\d{2})(\d{2})$/.exec(offset);
  if (!date || !time || !zone) return date || undefined;
  const [, hh, mm = '00', ss = '00'] = time;
  return `${date}T${hh}:${mm}:${ss}${zone[1]}${zone[2]}:${zone[3]}`;
}

/** DICOM PN "Kostaki^Daphne^Maria" → FHIR HumanName; undefined when there is no name. */
export function humanName(pn: string): HumanName | undefined {
  const [family, given, middle] = pn.split('^').map((part) => part.trim());
  const givens = [given, middle].filter(Boolean).flatMap((g) => g.split(/\s+/));
  if (!family && !givens.length) return undefined;
  return withoutEmpty<HumanName>({ use: 'official', family: family || undefined, given: givens });
}

/** DICOM Patient's Sex → FHIR gender. Anything else (or nothing) leaves the gender unset. */
const GENDERS: Readonly<Record<string, Patient['gender']>> = { M: 'male', F: 'female', O: 'other' };

/**
 * A new Patient from the patient attributes of a study, identified by its DICOM Patient ID (never
 * as an MRN). Only for when no Patient has that id yet: an existing one is never changed from
 * the PACS.
 */
export function patientFromStudy(study: DicomDataset): Patient {
  const name = humanName(dicomText(study, Tag.PatientName));
  return withoutEmpty({
    resourceType: 'Patient',
    active: true,
    identifier: [dicomPatientIdentifier(dicomText(study, Tag.PatientID))],
    name: name ? [name] : undefined,
    gender: GENDERS[dicomText(study, Tag.PatientSex).toUpperCase()],
    birthDate: fhirDate(dicomText(study, Tag.PatientBirthDate)) || undefined,
  });
}

/** The Study Instance UID as ImagingStudy stores it: "urn:oid:2.25.…" under urn:dicom:uid. */
export function studyUidIdentifier(uid: string): Identifier {
  return { system: CodeSystems.dicomUid, value: `urn:oid:${uid}` };
}

/**
 * An ImagingStudy from a QIDO-RS study and its series. Pass the stored ImagingStudy to update
 * it: everything that comes from the PACS is replaced, and what the app adds is kept (id and
 * version, the subject, reasons, notes, identifiers from other systems).
 */
export function imagingStudyFrom(
  study: DicomDataset,
  seriesList: DicomDataset[],
  subject: Reference,
  existing?: ImagingStudy,
): ImagingStudy {
  const offset = dicomText(study, Tag.TimezoneOffsetFromUTC);
  const series = seriesList
    .map((s) => seriesFrom(s, offset))
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));

  const studyModalities = dicomValues(study, Tag.ModalitiesInStudy).map(String);
  const modalityCodes = studyModalities.length
    ? studyModalities
    : [...new Set(series.map((s) => s.modality.code!))];

  const seriesInstances = series.map((s) => s.numberOfInstances);
  const summedInstances = seriesInstances.every((n) => n !== undefined)
    ? seriesInstances.reduce<number>((sum, n) => sum + n!, 0)
    : undefined;

  const accession = dicomText(study, Tag.AccessionNumber);
  const appIdentifiers = (existing?.identifier ?? []).filter(
    (i) => i.system !== CodeSystems.dicomUid && !isAccession(i),
  );
  const referrer = humanName(dicomText(study, Tag.ReferringPhysicianName));

  return withoutEmpty({
    ...existing,
    resourceType: 'ImagingStudy',
    identifier: [
      studyUidIdentifier(dicomText(study, Tag.StudyInstanceUID)),
      ...(accession
        ? [
            {
              type: { coding: [{ system: CodeSystems.identifierType, code: 'ACSN' }] },
              value: accession,
            },
          ]
        : []),
      ...appIdentifiers,
    ],
    status: 'available',
    subject: existing?.subject ?? subject,
    modality: modalityCodes.map((code): Coding => ({ system: CodeSystems.dicom, code })),
    started: fhirDateTime(dicomText(study, Tag.StudyDate), dicomText(study, Tag.StudyTime), offset),
    description: dicomText(study, Tag.StudyDescription) || undefined,
    referrer: referrer
      ? { display: [...(referrer.given ?? []), referrer.family].filter(Boolean).join(' ') }
      : undefined,
    numberOfSeries: dicomNumber(study, Tag.NumberOfStudyRelatedSeries) ?? series.length,
    numberOfInstances: dicomNumber(study, Tag.NumberOfStudyRelatedInstances) ?? summedInstances,
    series,
  });
}

/**
 * One ImagingStudy.series entry from a QIDO-RS series. The body part is kept as text: DICOM's
 * Body Part Examined is a free code string, and the app doesn't use SNOMED CT to code it.
 */
export function seriesFrom(series: DicomDataset, offset = ''): ImagingStudySeries {
  const bodyPart = dicomText(series, Tag.BodyPartExamined);
  return withoutEmpty({
    uid: dicomText(series, Tag.SeriesInstanceUID),
    number: dicomNumber(series, Tag.SeriesNumber),
    modality: { system: CodeSystems.dicom, code: dicomText(series, Tag.Modality) || 'OT' },
    description: dicomText(series, Tag.SeriesDescription) || undefined,
    numberOfInstances: dicomNumber(series, Tag.NumberOfSeriesRelatedInstances),
    bodySite: bodyPart ? { display: sentenceCase(bodyPart) } : undefined,
    started: fhirDateTime(
      dicomText(series, Tag.SeriesDate),
      dicomText(series, Tag.SeriesTime),
      offset,
    ),
  });
}

const isAccession = (identifier: Identifier) =>
  !!identifier.type?.coding?.some(
    (c) => c.system === CodeSystems.identifierType && c.code === 'ACSN',
  );

/** "PORT CHEST" → "Port chest". */
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/** Drops undefined, '' and [] properties: FHIR allows neither empty strings nor empty arrays. */
function withoutEmpty<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;
}
