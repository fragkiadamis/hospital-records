import type { ContactPoint, HumanName, Identifier, Patient } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { formatHumanName, preferredName } from '../../datatypes/human-name-pipe';
import { identifierValue } from '../../datatypes/identifier-pipe';
import { replaceEntry } from '../replace-entry';

/** Identifier system of Hospital Records medical record numbers. A placeholder until the hospital's own URI is known. */
export const MRN_SYSTEM = 'urn:hospital-records:mrn';

/**
 * Identifier system of the DICOM Patient ID (0010,0020) the PACS files a patient's studies under.
 * Kept apart from the MRN: the two often differ (outside studies, modalities assigning their own
 * ids), so patients are matched to PACS studies by this identifier only, never by MRN.
 */
export const DICOM_PATIENT_ID_SYSTEM = 'urn:hospital-records:dicom-patient-id';

/** A patient's DICOM Patient ID as a FHIR Identifier, typed PI (patient internal identifier). */
export function dicomPatientIdentifier(patientId: string): Identifier {
  return {
    use: 'secondary',
    type: {
      coding: [
        { system: CodeSystems.identifierType, code: 'PI', display: 'Patient internal identifier' },
      ],
      text: 'DICOM Patient ID',
    },
    system: DICOM_PATIENT_ID_SYSTEM,
    value: patientId,
  };
}

/** What the patient form edits: flat fields, '' when empty. */
export interface PatientFormValue {
  given: string; // all given names, separated by spaces
  family: string;
  gender: NonNullable<Patient['gender']> | '';
  birthDate: string; // YYYY-MM-DD
  phone: string;
  email: string;
  mrn: string;
}

const isPhone = (t: ContactPoint) => t.system === 'phone';
const isEmail = (t: ContactPoint) => t.system === 'email';
const isMrn = (i: Identifier) => i.system === MRN_SYSTEM;

/** Patient → form. Each field shows the one entry the form edits (the preferred name, the first phone, …). */
export function patientToForm(patient: Patient): PatientFormValue {
  const name = preferredName(patient.name);
  return {
    given: name?.given?.join(' ') ?? '',
    family: name?.family ?? '',
    gender: patient.gender ?? '',
    birthDate: patient.birthDate ?? '',
    phone: patient.telecom?.find(isPhone)?.value ?? '',
    email: patient.telecom?.find(isEmail)?.value ?? '',
    mrn: identifierValue(patient.identifier, MRN_SYSTEM),
  };
}

/**
 * Form → Patient. Pass the stored resource when editing: PUT replaces the whole resource, so
 * everything the form does not edit (addresses, extensions, other names, a second phone, other
 * identifiers, …) is copied over unchanged, and only the entries the form shows are replaced.
 */
export function formToPatient(value: PatientFormValue, existing?: Patient): Patient {
  const currentName = preferredName(existing?.name);
  const currentPhone = existing?.telecom?.find(isPhone);
  const currentEmail = existing?.telecom?.find(isEmail);
  const currentMrn = existing?.identifier?.find(isMrn);

  const phone = value.phone.trim();
  const email = value.email.trim();
  const mrn = value.mrn.trim();

  let telecom = replaceEntry(
    existing?.telecom,
    currentPhone,
    phone ? { system: 'phone', use: 'mobile', ...currentPhone, value: phone } : undefined,
  );
  telecom = replaceEntry(
    telecom,
    currentEmail,
    email ? { system: 'email', ...currentEmail, value: email } : undefined,
  );

  return {
    ...existing,
    resourceType: 'Patient',
    active: existing?.active ?? true,
    name: replaceEntry(existing?.name, currentName, editedName(value, currentName)),
    gender: value.gender || undefined,
    birthDate: value.birthDate || undefined,
    telecom,
    identifier: replaceEntry(
      existing?.identifier,
      currentMrn,
      mrn ? { system: MRN_SYSTEM, ...currentMrn, value: mrn } : undefined,
    ),
  };
}

/**
 * "Daphne Kostaki". A patient without a name (anonymised DICOM often has none) goes by an id a
 * person can recognise: the MRN, else the DICOM Patient ID, else the resource reference.
 */
export function patientDisplayName(patient: Patient): string {
  return (
    formatHumanName(patient.name) ||
    identifierValue(patient.identifier, MRN_SYSTEM) ||
    identifierValue(patient.identifier, DICOM_PATIENT_ID_SYSTEM) ||
    `Patient/${patient.id ?? 'new'}`
  );
}

/**
 * The preferred name with the form's given and family names. Keeps its prefix, suffix, period
 * and use; drops `text` only when the name changed, since it would then be out of date.
 */
function editedName(value: PatientFormValue, current?: HumanName): HumanName | undefined {
  const given = value.given.trim().split(/\s+/).filter(Boolean);
  const family = value.family.trim();
  if (!given.length && !family) return undefined;

  const unchanged =
    family === (current?.family ?? '') && given.join(' ') === (current?.given ?? []).join(' ');
  if (current && unchanged) return current;

  return {
    use: 'official',
    ...current,
    text: undefined,
    family: family || undefined,
    given: given.length ? given : undefined,
  };
}
