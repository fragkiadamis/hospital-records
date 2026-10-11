import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FhirClient } from '../../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../../fhir/client/fhir-error';
import { byRelevance } from '../../../fhir/resources/condition/condition-mapper';
import { ConditionSummary } from '../../../fhir/resources/condition/condition-summary/condition-summary';

/** More than any patient is expected to have; paging comes if that turns out wrong. */
const MAX_CONDITIONS = 200;

/** The "Conditions" card of the patient page: every Condition whose subject is the patient. */
@Component({
  imports: [ConditionSummary, RouterLink],
  selector: 'app-patient-conditions',
  styleUrl: './patient-conditions.scss',
  templateUrl: './patient-conditions.html',
})
export class PatientConditions {
  private readonly fhir = inject(FhirClient);

  readonly patientId = input.required<string>();

  protected readonly conditions = rxResource({
    params: () => this.patientId(),
    stream: ({ params: id }) =>
      this.fhir.search('Condition', { subject: `Patient/${id}`, _count: MAX_CONDITIONS }),
  });

  /** Ongoing first, refuted / entered-in-error last, newest onset first within each group. */
  protected readonly sorted = computed(() =>
    this.conditions.hasValue() ? [...this.conditions.value()].sort(byRelevance) : [],
  );

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.conditions.error()));
}
