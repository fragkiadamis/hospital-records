import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import type { Bundle } from 'fhir/r4';
import { forkJoin, map, Observable, of } from 'rxjs';
import { FhirClient, ResourceType } from '../client/fhir-client';
import { fhirErrorMessage } from '../client/fhir-error';

/** How many resources of one type point to the resource being deleted. */
export interface LinkedCount {
  type: string;
  count: number;
}

/** The resources a `_revinclude=*` search found pointing to the resource, counted by type. */
function countIncluded(bundle: Bundle): LinkedCount[] {
  return (bundle.entry ?? [])
    .filter((entry) => entry.search?.mode === 'include' && entry.resource)
    .map((entry) => ({ type: entry.resource!.resourceType, count: 1 }));
}

/** Adds up counts of the same type. */
function sumByType(counts: LinkedCount[]): LinkedCount[] {
  const totals = new Map<string, number>();
  for (const { type, count } of counts) totals.set(type, (totals.get(type) ?? 0) + count);
  return [...totals].map(([type, count]) => ({ type, count }));
}

/**
 * The delete flow for any resource, shown when `open` becomes true (bind it with `[(open)]` to
 * the page's Delete button). It first looks for every resource that points to this one, and
 * refuses while there are any instead of deleting them along with it. Otherwise it asks for
 * confirmation, deletes, and emits `deleted`.
 *
 * HAPI refuses (409) to delete a resource referenced through a searchable path, but not through
 * paths without a search parameter; pass `extraLinks` to cover those.
 */
@Component({
  selector: 'app-delete-panel',
  styleUrl: './delete-panel.scss',
  templateUrl: './delete-panel.html',
})
export class DeletePanel {
  private readonly fhir = inject(FhirClient);

  readonly resourceType = input.required<ResourceType>();
  readonly resourceId = input.required<string>();
  /** What the resource is called, e.g. "Ilse Varga" or "Pneumonia". */
  readonly name = input.required<string>();
  /** What kind of record it is, in words: "patient", "condition". */
  readonly noun = input.required<string>();
  /** Anything else to know before confirming, e.g. that the record will come back. */
  readonly note = input('');

  /**
   * Extra links to look for, for references `_revinclude=*` can't see because FHIR has no search
   * parameter for them (and which HAPI therefore doesn't protect either).
   */
  readonly extraLinks = input<() => Observable<LinkedCount[]>>();

  readonly open = model(false);
  readonly deleted = output<void>();

  protected readonly step = signal<'checking' | 'failed' | 'blocked' | 'confirm' | 'deleting'>(
    'checking',
  );
  protected readonly linked = signal<LinkedCount[]>([]);
  protected readonly error = signal('');

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.checkLinks());
    });
  }

  protected confirm(): void {
    this.step.set('deleting');
    this.error.set('');
    this.fhir.delete(this.resourceType(), this.resourceId()).subscribe({
      next: () => {
        this.open.set(false);
        this.deleted.emit();
      },
      error: (err) => {
        // A record linked after the check still makes HAPI refuse (409); its message names it.
        this.error.set(fhirErrorMessage(err));
        this.step.set('confirm');
      },
    });
  }

  protected retry(): void {
    this.checkLinks();
  }

  protected close(): void {
    this.open.set(false);
  }

  private checkLinks(): void {
    this.step.set('checking');
    this.error.set('');
    const params = { _id: this.resourceId(), _revinclude: '*' };
    forkJoin([
      this.fhir.searchBundle(this.resourceType(), params).pipe(map(countIncluded)),
      this.extraLinks()?.() ?? of([]),
    ]).subscribe({
      next: ([included, extra]) => {
        this.linked.set(sumByType([...included, ...extra]));
        this.step.set(this.linked().length ? 'blocked' : 'confirm');
      },
      error: (err) => {
        // Not knowing is not safe: HAPI doesn't protect the links `extraLinks` looks for.
        this.error.set(fhirErrorMessage(err));
        this.step.set('failed');
      },
    });
  }
}
