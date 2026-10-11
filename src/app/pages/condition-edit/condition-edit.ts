import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { Condition } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage, isVersionConflict } from '../../fhir/client/fhir-error';
import { ConditionForm } from '../../fhir/resources/condition/condition-form/condition-form';
import { isConditionOf } from '../../fhir/resources/condition/condition-mapper';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [ConditionForm, Icon, RouterLink],
  selector: 'app-condition-edit',
  templateUrl: './condition-edit.html',
})
export class ConditionEdit {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /patients/:id/conditions/:conditionId/edit (router input binding). */
  readonly id = input.required<string>();
  readonly conditionId = input.required<string>();

  protected readonly condition = rxResource({
    params: () => this.conditionId(),
    stream: ({ params: id }) => this.fhir.read('Condition', id),
  });

  /** False when the URL pairs the condition with a patient it doesn't belong to. */
  protected readonly belongsToPatient = computed(
    () => this.condition.hasValue() && isConditionOf(this.condition.value(), this.id()),
  );

  protected readonly loadError = computed(() => fhirErrorMessage(this.condition.error()));
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  /** Someone else saved the condition after we loaded it, so our version is out of date. */
  protected readonly conflict = signal(false);

  protected update(condition: Condition): void {
    this.saving.set(true);
    this.saveError.set('');
    this.conflict.set(false);
    // The condition carries the meta.versionId we loaded, which update() sends as If-Match.
    this.fhir.update(condition).subscribe({
      next: () => this.openCondition(),
      error: (err) => {
        this.conflict.set(isVersionConflict(err));
        this.saveError.set(fhirErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  /** Loads the latest version, dropping the user's unsaved changes. */
  protected reload(): void {
    this.conflict.set(false);
    this.saveError.set('');
    this.condition.reload();
  }

  protected openCondition(): void {
    this.router.navigate(['/patients', this.id(), 'conditions', this.conditionId()]);
  }
}
