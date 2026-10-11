import type { Identifier } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import identifiers from './patient-identifiers.json';

/**
 * A kind of identifier patients have, e.g. the MRN. The list lives in patient-identifiers.json,
 * which `npm run seed` also reads to install the search parameters on HAPI, so adding a kind of
 * identifier is one entry there: the patient form gets a field for it, the patient detail labels
 * it, a patient without a name goes by it, and the patient search offers it.
 */
export interface PatientIdentifierType {
  /** Stable name for code, e.g. "mrn". */
  key: string;
  /** The Identifier.system it is issued under. */
  system: string;
  /** What the app calls it, e.g. "MRN". */
  label: string;
  /**
   * The custom search parameter (a string search on this identifier's value, so it can match
   * like a name: anywhere in the value with :contains, ignoring case) that `npm run seed`
   * installs on HAPI.
   */
  searchParam: string;
  /** Identifier.use given to new identifiers of this type, e.g. "secondary". */
  use?: Identifier['use'];
  /** Shown under its field in the patient form. */
  hint?: string;
  /** HL7 v2 table 0203 code typing new identifiers of this type, e.g. "PI", with its display. */
  typeCode?: string;
  typeDisplay?: string;
}

/** Every kind of patient identifier, in the order a patient without a name goes by them. */
export const PATIENT_IDENTIFIER_TYPES = identifiers.types as readonly PatientIdentifierType[];

/** The custom search parameter on any identifier's value, whatever its system. */
export const ANY_IDENTIFIER_SEARCH_PARAM = identifiers.anyIdentifierSearchParam;

/** The identifier type with this key; throws for an unknown one, which is a programming error. */
export function patientIdentifierType(key: string): PatientIdentifierType {
  const type = PATIENT_IDENTIFIER_TYPES.find((t) => t.key === key);
  if (!type) throw new Error(`Unknown patient identifier type "${key}"`);
  return type;
}

/** Labels by system, for identifierLabel(). */
export const PATIENT_IDENTIFIER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  PATIENT_IDENTIFIER_TYPES.map((t) => [t.system, t.label]),
);

/** A new identifier of this type with this value, typed and used as the list says. */
export function newPatientIdentifier(type: PatientIdentifierType, value: string): Identifier {
  return {
    ...(type.use ? { use: type.use } : {}),
    ...(type.typeCode
      ? {
          type: {
            coding: [
              {
                system: CodeSystems.identifierType,
                code: type.typeCode,
                ...(type.typeDisplay ? { display: type.typeDisplay } : {}),
              },
            ],
            text: type.label,
          },
        }
      : {}),
    system: type.system,
    value,
  };
}
