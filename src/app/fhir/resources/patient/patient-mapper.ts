import type { ContactPoint, HumanName, Identifier, Patient } from 'fhir/r4';
import { formatHumanName, preferredName } from '../../datatypes/human-name-pipe';
import { identifierValue } from '../../datatypes/identifier-pipe';
import { replaceEntry } from '../replace-entry';
import {
  newPatientIdentifier,
  PATIENT_IDENTIFIER_TYPES,
  patientIdentifierType,
} from './patient-identifiers';

/** Identifier system of Hospital Records medical record numbers. A placeholder until the hospital's own URI is known. */
export const MRN_SYSTEM = patientIdentifierType('mrn').system;

/**
 * Identifier system of the DICOM Patient ID (0010,0020) the PACS files a patient's studies under.
 * Kept apart from the MRN: the two often differ (outside studies, modalities assigning their own
 * ids), so patients are matched to PACS studies by this identifier only, never by MRN.
 */
export const DICOM_PATIENT_ID_SYSTEM = patientIdentifierType('dicomPatientId').system;

/** A patient's DICOM Patient ID as a FHIR Identifier, typed PI (patient internal identifier). */
export function dicomPatientIdentifier(patientId: string): Identifier {
  return newPatientIdentifier(patientIdentifierType('dicomPatientId'), patientId);
}

/** What the patient form edits: flat fields, '' when empty. */
export interface PatientFormValue {
  given: string; // all given names, separated by spaces
  family: string;
  gender: NonNullable<Patient['gender']> | '';
  birthDate: string; // YYYY-MM-DD
  phone: string;
  email: string;
  /** One value per kind of patient identifier (PATIENT_IDENTIFIER_TYPES), by its key. */
  identifiers: Record<string, string>;
}

const isPhone = (t: ContactPoint) => t.system === 'phone';
const isEmail = (t: ContactPoint) => t.system === 'email';

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
    identifiers: Object.fromEntries(
      PATIENT_IDENTIFIER_TYPES.map((t) => [t.key, identifierValue(patient.identifier, t.system)]),
    ),
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

  const phone = value.phone.trim();
  const email = value.email.trim();

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
    identifier: editedIdentifiers(value, existing?.identifier),
  };
}

/**
 * The identifiers with the form's value for each kind of patient identifier: the first one of
 * that system is edited in place (keeping its type, period, …), added, or removed when cleared.
 * Identifiers of other systems are kept as they are.
 */
function editedIdentifiers(
  value: PatientFormValue,
  identifiers: Identifier[] | undefined,
): Identifier[] | undefined {
  return PATIENT_IDENTIFIER_TYPES.reduce((all, type) => {
    const current = all?.find((i) => i.system === type.system);
    const entered = (value.identifiers[type.key] ?? '').trim();
    const edited = entered
      ? { ...newPatientIdentifier(type, entered), ...current, value: entered }
      : undefined;
    return replaceEntry(all, current, edited);
  }, identifiers);
}

/**
 * "Daphne Kostaki". A patient without a name (anonymised DICOM often has none) goes by an id a
 * person can recognise, in the order of PATIENT_IDENTIFIER_TYPES (the MRN, then the DICOM
 * Patient ID, …), else by the resource reference.
 */
export function patientDisplayName(patient: Patient): string {
  const identifier = PATIENT_IDENTIFIER_TYPES.map((t) =>
    identifierValue(patient.identifier, t.system),
  ).find(Boolean);
  return formatHumanName(patient.name) || identifier || `Patient/${patient.id ?? 'new'}`;
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
