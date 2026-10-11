import type { Annotation, CodeableConcept, Coding, Condition, Reference } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { findCoding, formatCodeableConcept } from '../../datatypes/codeable-concept-pipe';
import { isReferenceTo } from '../../datatypes/reference-pipe';
import { replaceEntry } from '../replace-entry';

/** HL7 condition-clinical codes, with the labels the app shows for them. */
export const CLINICAL_STATUSES = {
  active: 'Active',
  recurrence: 'Recurrence',
  relapse: 'Relapse',
  inactive: 'Inactive',
  remission: 'Remission',
  resolved: 'Resolved',
} as const;

/** HL7 condition-ver-status codes. */
export const VERIFICATION_STATUSES = {
  unconfirmed: 'Unconfirmed',
  provisional: 'Provisional',
  differential: 'Differential',
  confirmed: 'Confirmed',
  refuted: 'Refuted',
  'entered-in-error': 'Entered in error',
} as const;

/** HL7 condition-category codes. */
export const CONDITION_CATEGORIES = {
  'problem-list-item': 'Problem list item',
  'encounter-diagnosis': 'Encounter diagnosis',
} as const;

export type ClinicalStatus = keyof typeof CLINICAL_STATUSES;
export type VerificationStatus = keyof typeof VERIFICATION_STATUSES;
export type ConditionCategory = keyof typeof CONDITION_CATEGORIES;

/** What the condition form edits: flat fields, '' when empty. */
export interface ConditionFormValue {
  icd10Code: string;
  icd10Display: string;
  icd11Code: string; // WHO ICD-11 MMS, e.g. CA40.Z or a combination like 1A00&XN8P1
  icd11Display: string;
  clinicalStatus: ClinicalStatus | '';
  verificationStatus: VerificationStatus | '';
  category: ConditionCategory | '';
  onsetDate: string; // YYYY-MM-DD
  abatementDate: string; // YYYY-MM-DD
  details: string; // free text the codes can't say, kept as the condition's first note
}

/** The code of a status or category concept from the given HL7 code system, or ''. */
function codeIn<T extends string>(concept: CodeableConcept | undefined, system: string): T | '' {
  return (findCoding(concept, system)?.code as T | undefined) ?? '';
}

export const clinicalStatusOf = (c: Condition) =>
  codeIn<ClinicalStatus>(c.clinicalStatus, CodeSystems.conditionClinical);

export const verificationStatusOf = (c: Condition) =>
  codeIn<VerificationStatus>(c.verificationStatus, CodeSystems.conditionVerification);

const ONGOING = new Set<string>(['active', 'recurrence', 'relapse']);
const UNCERTAIN = new Set<string>(['unconfirmed', 'provisional', 'differential']);
const VOID = new Set<string>(['refuted', 'entered-in-error']);

/** The condition is currently present: active, recurrence or relapse. */
export const isOngoing = (c: Condition) => ONGOING.has(clinicalStatusOf(c));

/** The diagnosis is not (yet) certain: unconfirmed, provisional or differential. */
export const isUncertain = (c: Condition) => UNCERTAIN.has(verificationStatusOf(c));

/** The condition turned out not to be real: refuted or entered in error. */
export const isVoid = (c: Condition) => VOID.has(verificationStatusOf(c));

/** Onset as a sortable string (dateTime or period start), '' when unknown or not a date. */
const onsetKey = (c: Condition) => c.onsetDateTime ?? c.onsetPeriod?.start ?? '';

/**
 * Most relevant first: ongoing conditions, then the others, then refuted or entered in error;
 * within each group, newest onset first and unknown onsets last.
 */
export function byRelevance(a: Condition, b: Condition): number {
  const rank = (c: Condition) => (isVoid(c) ? 2 : isOngoing(c) ? 0 : 1);
  return rank(a) - rank(b) || onsetKey(b).localeCompare(onsetKey(a));
}

const categoryCoding = (concept: CodeableConcept) =>
  findCoding(concept, CodeSystems.conditionCategory);

/** Condition → form. Onset/abatement show only dates; ages, periods and text stay as stored. */
export function conditionToForm(condition: Condition): ConditionFormValue {
  const icd10 = findCoding(condition.code, CodeSystems.icd10);
  const icd11 = findCoding(condition.code, CodeSystems.icd11);
  const category = condition.category?.map(categoryCoding).find(Boolean);
  return {
    icd10Code: icd10?.code ?? '',
    icd10Display: icd10?.display ?? '',
    icd11Code: icd11?.code ?? '',
    icd11Display: icd11?.display ?? '',
    clinicalStatus: clinicalStatusOf(condition),
    verificationStatus: verificationStatusOf(condition),
    category: (category?.code as ConditionCategory | undefined) ?? '',
    onsetDate: condition.onsetDateTime ?? '',
    abatementDate: condition.abatementDateTime ?? '',
    details: condition.note?.[0]?.text ?? '',
  };
}

/**
 * Form → Condition. `subject` is the patient for a new condition; an existing condition keeps
 * its own. As with patients, everything the form doesn't edit is copied from `existing`, and
 * only the codings, statuses and dates the form shows are replaced.
 */
export function formToCondition(
  value: ConditionFormValue,
  subject: Reference,
  existing?: Condition,
): Condition {
  return {
    ...existing,
    resourceType: 'Condition',
    subject: existing?.subject ?? subject,
    code: editedCode(value, existing?.code),
    clinicalStatus: statusConcept(
      CodeSystems.conditionClinical,
      value.clinicalStatus,
      existing?.clinicalStatus,
    ),
    verificationStatus: statusConcept(
      CodeSystems.conditionVerification,
      value.verificationStatus,
      existing?.verificationStatus,
    ),
    category: editedCategories(value.category, existing?.category),
    note: editedNotes(value.details, existing?.note),
    ...timeChoice('onset', value.onsetDate, existing),
    ...timeChoice('abatement', value.abatementDate, existing),
  };
}

/**
 * Whether the condition's subject is the given patient. Pages under /patients/:id check it, so
 * an edited URL can't show one patient's condition under another patient's name.
 */
export function isConditionOf(condition: Condition, patientId: string): boolean {
  return isReferenceTo(condition.subject, 'Patient', patientId);
}

/** The condition's name: the code's text if stored, else the ICD-10 name, else the reference. */
export function conditionDisplayName(condition: Condition): string {
  return (
    formatCodeableConcept(condition.code, CodeSystems.icd10) || `Condition/${condition.id ?? 'new'}`
  );
}

/**
 * Condition.code with the form's ICD-10 and ICD-11 codings; their names are the condition's name.
 * Codings of other systems, e.g. set by another hospital system, stay as stored. A stored `text`
 * (a name given before, or by another system) stays while both codes are the same, and is dropped
 * when either changes, since it might then describe the old code.
 */
function editedCode(value: ConditionFormValue, current?: CodeableConcept) {
  const edits = [
    { system: CodeSystems.icd10, code: value.icd10Code, display: value.icd10Display },
    { system: CodeSystems.icd11, code: value.icd11Code, display: value.icd11Display },
  ];
  let coding = current?.coding;
  let changed = false;
  for (const { system, code: rawCode, display } of edits) {
    const code = rawCode.trim();
    const old = findCoding(current, system);
    const next: Coding | undefined = code
      ? { ...(old?.code === code ? old : {}), system, code, display: display.trim() || undefined }
      : undefined;
    coding = replaceEntry(coding, old, next);
    changed ||= (old?.code ?? '') !== code;
  }
  const text = changed ? undefined : current?.text;
  if (!coding?.length && !text) return undefined;
  return { ...current, coding, text };
}

/**
 * Condition.note with the form's details as the first note. Other notes (e.g. added by another
 * system) stay; a note whose text didn't change is kept exactly as stored (author, time).
 */
function editedNotes(details: string, current?: Annotation[]) {
  const first = current?.[0];
  const text = details.trim();
  const next = !text ? undefined : first?.text === text ? first : { ...first, text };
  return replaceEntry(current, first, next);
}

/** A status concept for `code`; the stored one is kept as is when its code didn't change. */
function statusConcept(system: string, code: string, current?: CodeableConcept) {
  if (!code) return undefined;
  if (findCoding(current, system)?.code === code) return current;
  return { coding: [{ system, code }] };
}

/** Condition.category with the form's category in place of the stored HL7 one; others stay. */
function editedCategories(code: string, current?: CodeableConcept[]) {
  const old = current?.find((c) => categoryCoding(c));
  const next =
    old && categoryCoding(old)?.code === code
      ? old
      : code
        ? { coding: [{ system: CodeSystems.conditionCategory, code }] }
        : undefined;
  return replaceEntry(current, old, next);
}

/**
 * The fields of a time choice type (onset[x], abatement[x]) after the form's date: a date
 * replaces whatever variant was stored; no date keeps a stored age, period, range or text.
 */
function timeChoice(prefix: 'onset' | 'abatement', date: string, existing?: Condition) {
  const variants = ['DateTime', 'Age', 'Period', 'Range', 'String'].map((v) => `${prefix}${v}`);
  const fields: Record<string, unknown> = Object.fromEntries(variants.map((f) => [f, undefined]));
  if (date) return { ...fields, [`${prefix}DateTime`]: date };
  for (const field of variants.slice(1)) {
    fields[field] = existing?.[field as keyof Condition];
  }
  return fields;
}
