import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { parseReference } from '../../fhir/datatypes/reference-pipe';
import { ConditionDetail } from '../../fhir/resources/condition/condition-detail/condition-detail';
import { conditionDisplayName } from '../../fhir/resources/condition/condition-mapper';

@Component({
  imports: [ConditionDetail, RouterLink],
  selector: 'app-condition-page',
  templateUrl: './condition-page.html',
})
export class ConditionPage {
  private readonly fhir = inject(FhirClient);

  /** From the route, /patients/:id/conditions/:conditionId (router input binding). */
  readonly id = input.required<string>();
  readonly conditionId = input.required<string>();

  protected readonly condition = rxResource({
    params: () => this.conditionId(),
    stream: ({ params: id }) => this.fhir.read('Condition', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.condition.error()));

  /** False when the URL pairs the condition with a patient it doesn't belong to. */
  protected readonly belongsToPatient = computed(() => {
    if (!this.condition.hasValue()) return false;
    const subject = parseReference(this.condition.value().subject);
    return subject?.type === 'Patient' && subject.id === this.id();
  });

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.belongsToPatient() && this.condition.hasValue()) {
        title.setTitle(`${conditionDisplayName(this.condition.value())} · Artemis`);
      }
    });
  }
}
