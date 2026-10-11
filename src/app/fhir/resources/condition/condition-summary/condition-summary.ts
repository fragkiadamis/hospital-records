import { Component, computed, input } from '@angular/core';
import type { Condition } from 'fhir/r4';
import { CodingChip } from '../../../datatypes/coding-chip/coding-chip';
import { TimeChoicePipe } from '../../../datatypes/time-choice-pipe';
import {
  CLINICAL_STATUSES,
  clinicalStatusOf,
  conditionDisplayName,
  isOngoing,
  isUncertain,
  isVoid,
  VERIFICATION_STATUSES,
  verificationStatusOf,
} from '../condition-mapper';

/**
 * One-line condition: name, clinical status, doubtful verification, onset/end and codes.
 * Display only; wrap it in a link where it should be clickable.
 */
@Component({
  imports: [CodingChip, TimeChoicePipe],
  selector: 'app-condition-summary',
  styleUrl: './condition-summary.scss',
  templateUrl: './condition-summary.html',
})
export class ConditionSummary {
  readonly condition = input.required<Condition>();

  protected readonly name = computed(() => conditionDisplayName(this.condition()));

  protected readonly status = computed(() => {
    const code = clinicalStatusOf(this.condition());
    return code
      ? { label: CLINICAL_STATUSES[code], ongoing: isOngoing(this.condition()) }
      : undefined;
  });

  /** Shown only when it is not the usual "confirmed". */
  protected readonly verification = computed(() => {
    const code = verificationStatusOf(this.condition());
    if (!code || code === 'confirmed') return undefined;
    return { label: VERIFICATION_STATUSES[code], uncertain: isUncertain(this.condition()) };
  });

  protected readonly voided = computed(() => isVoid(this.condition()));

  protected readonly codings = computed(() =>
    (this.condition().code?.coding ?? []).filter((coding) => coding.code),
  );
}
