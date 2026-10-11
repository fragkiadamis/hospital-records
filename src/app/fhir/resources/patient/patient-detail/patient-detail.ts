import { TitleCasePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { ContactPoint, Patient } from 'fhir/r4';
import { AddressPipe } from '../../../datatypes/address-pipe';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import { formatHumanName } from '../../../datatypes/human-name-pipe';
import { identifierLabel } from '../../../datatypes/identifier-pipe';
import { DICOM_PATIENT_ID_SYSTEM, MRN_SYSTEM, patientDisplayName } from '../patient-mapper';
import { Icon } from '../../../../shared/icon/icon';
import { IconName } from '../../../../shared/icon/icons';

const KNOWN_IDENTIFIER_SYSTEMS = {
  [MRN_SYSTEM]: 'MRN',
  [DICOM_PATIENT_ID_SYSTEM]: 'DICOM Patient ID',
};

const CONTACT_ICONS: Partial<Record<NonNullable<ContactPoint['system']>, IconName>> = {
  phone: 'phone',
  email: 'mail',
  fax: 'printer',
  sms: 'message',
  url: 'world',
};

/** Everything on a Patient record, read-only. Shows all entries, not only those the form edits. */
@Component({
  imports: [AddressPipe, FhirDatePipe, Icon, TitleCasePipe],
  selector: 'app-patient-detail',
  styleUrl: './patient-detail.scss',
  templateUrl: './patient-detail.html',
})
export class PatientDetail {
  readonly patient = input.required<Patient>();

  protected readonly name = computed(() => patientDisplayName(this.patient()));

  protected readonly identifiers = computed(() =>
    (this.patient().identifier ?? []).map((identifier) => ({
      label: identifierLabel(identifier, KNOWN_IDENTIFIER_SYSTEMS),
      value: identifier.value ?? '',
    })),
  );

  /** Names besides the one in the heading, e.g. a maiden name or nickname. */
  protected readonly otherNames = computed(() => {
    const names = this.patient().name ?? [];
    return names.length > 1
      ? names.map((name) => ({ text: formatHumanName([name]), use: name.use }))
      : [];
  });

  protected readonly contacts = computed(() =>
    (this.patient().telecom ?? []).map((contact) => ({
      ...contact,
      icon: (contact.system && CONTACT_ICONS[contact.system]) || ('address-book' as IconName),
    })),
  );

  /** Set when the patient has died, with the date if known. deceasedBoolean false means alive. */
  protected readonly deceased = computed(() => {
    const p = this.patient();
    return p.deceasedDateTime || p.deceasedBoolean ? { date: p.deceasedDateTime } : undefined;
  });
}
