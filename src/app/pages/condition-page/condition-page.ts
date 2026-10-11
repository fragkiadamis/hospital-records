import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { DeletePanel } from '../../fhir/delete-panel/delete-panel';
import { ConditionDetail } from '../../fhir/resources/condition/condition-detail/condition-detail';
import { studiesWithReason } from '../../fhir/resources/condition/condition-links';
import {
  conditionDisplayName,
  isConditionOf,
} from '../../fhir/resources/condition/condition-mapper';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [ConditionDetail, DeletePanel, Icon, RouterLink],
  selector: 'app-condition-page',
  templateUrl: './condition-page.html',
})
export class ConditionPage {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /patients/:id/conditions/:conditionId (router input binding). */
  readonly id = input.required<string>();
  readonly conditionId = input.required<string>();

  protected readonly condition = rxResource({
    params: () => this.conditionId(),
    stream: ({ params: id }) => this.fhir.read('Condition', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.condition.error()));

  /** False when the URL pairs the condition with a patient it doesn't belong to. */
  protected readonly belongsToPatient = computed(
    () => this.condition.hasValue() && isConditionOf(this.condition.value(), this.id()),
  );

  protected readonly name = computed(() =>
    this.condition.hasValue() ? conditionDisplayName(this.condition.value()) : '',
  );

  /** Whether the delete panel is open; it is two-way bound to the panel's `open`. */
  protected readonly deleting = signal(false);

  /** ImagingStudies naming this condition as their reason, which `_revinclude` can't find. */
  protected readonly studiesWithReason = () =>
    studiesWithReason(this.fhir, this.condition.value()!);

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.belongsToPatient()) title.setTitle(`${this.name()} · Hospital Records`);
    });
  }

  protected onDeleted(): void {
    this.router.navigate(['/patients', this.id()]);
  }
}
