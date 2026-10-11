import { Component, computed, input } from '@angular/core';
import type { Coding } from 'fhir/r4';
import { CODE_SYSTEM_LABELS } from '../../code-systems';

/**
 * A code as a small badge: "ICD-10 C50.9". Hovering shows the code's name and its system
 * URI; screen readers get the name as text, since they can't hover.
 */
@Component({
  selector: 'app-coding-chip',
  styleUrl: './coding-chip.scss',
  templateUrl: './coding-chip.html',
  host: { '[attr.title]': 'tooltip()' },
})
export class CodingChip {
  readonly coding = input.required<Coding>();

  protected readonly label = computed(
    () => CODE_SYSTEM_LABELS[this.coding().system ?? ''] ?? 'Code',
  );

  protected readonly tooltip = computed(() =>
    [this.coding().display, this.coding().system].filter(Boolean).join('\n'),
  );
}
