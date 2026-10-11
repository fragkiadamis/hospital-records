import { TitleCasePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { Patient } from 'fhir/r4';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import { IdentifierPipe } from '../../../datatypes/identifier-pipe';
import { MRN_SYSTEM, patientDisplayName } from '../patient-mapper';
import { Icon } from '../../../../shared/icon/icon';

/**
 * One-line patient: name, sex, birth date and MRN. Display only; wrap it in a link or a
 * button where it should be clickable.
 */
@Component({
  imports: [FhirDatePipe, Icon, IdentifierPipe, TitleCasePipe],
  selector: 'app-patient-summary',
  styleUrl: './patient-summary.scss',
  templateUrl: './patient-summary.html',
})
export class PatientSummary {
  readonly patient = input.required<Patient>();

  protected readonly name = computed(() => patientDisplayName(this.patient()));
  protected readonly mrnSystem = MRN_SYSTEM;
}
