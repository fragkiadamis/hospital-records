import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ImagingStudy } from 'fhir/r4';
import { FhirClient } from '../../../fhir/client/fhir-client';
import { fhirErrorMessage, isVersionConflict } from '../../../fhir/client/fhir-error';
import {
  byRelevance,
  CLINICAL_STATUSES,
  clinicalStatusOf,
  conditionDisplayName,
} from '../../../fhir/resources/condition/condition-mapper';
import {
  reasonConditionIds,
  reasonTransaction,
} from '../../../fhir/resources/imaging-study/study-reasons';
import { Icon } from '../../../shared/icon/icon';

/**
 * Chooses which of the patient's conditions the study was done for. Saving updates the study's
 * reasonReference and the conditions' evidence together, in one transaction.
 */
@Component({
  imports: [Icon],
  selector: 'app-study-reasons',
  styleUrl: './study-reasons.scss',
  templateUrl: './study-reasons.html',
})
export class StudyReasons {
  private readonly fhir = inject(FhirClient);

  readonly study = input.required<ImagingStudy>();
  readonly patientId = input.required<string>();
  readonly open = model(false);
  /** The study and conditions changed on the server: the page should reload the study. */
  readonly changed = output<void>();

  /** The patient's conditions, loaded when the panel opens. */
  protected readonly conditions = rxResource({
    params: () => (this.open() ? this.patientId() : undefined),
    stream: ({ params: id }) =>
      this.fhir.search('Condition', { subject: `Patient/${id}`, _count: 200 }),
  });

  protected readonly options = computed(() =>
    this.conditions.hasValue()
      ? [...this.conditions.value()].sort(byRelevance).map((condition) => {
          const status = clinicalStatusOf(condition);
          return {
            id: condition.id!,
            name: conditionDisplayName(condition),
            status: status ? CLINICAL_STATUSES[status] : '',
          };
        })
      : [],
  );

  protected readonly selected = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  protected readonly loadError = computed(() => fhirErrorMessage(this.conditions.error()));

  constructor() {
    // Start from what the study says now, whenever the panel opens or the study is reloaded.
    effect(() => {
      if (this.open()) this.selected.set(reasonConditionIds(this.study()));
    });
  }

  protected toggle(id: string, checked: boolean): void {
    this.selected.update((ids) => (checked ? [...ids, id] : ids.filter((i) => i !== id)));
  }

  protected save(): void {
    const entries = reasonTransaction(this.study(), this.conditions.value() ?? [], this.selected());
    if (!entries.length) {
      this.open.set(false);
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    this.fhir.transaction(entries).subscribe({
      next: () => {
        this.saving.set(false);
        this.open.set(false);
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.conflict.set(isVersionConflict(err));
        this.error.set(fhirErrorMessage(err));
      },
    });
  }

  /** After a conflict: load everyone's latest versions, dropping this selection. */
  protected reload(): void {
    this.conflict.set(false);
    this.error.set('');
    this.conditions.reload();
    this.changed.emit();
  }

  protected close(): void {
    this.error.set('');
    this.conflict.set(false);
    this.open.set(false);
  }
}
