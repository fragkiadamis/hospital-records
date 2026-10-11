import { Component, computed, input } from '@angular/core';
import type { Condition } from 'fhir/r4';
import { CodingChip } from '../../../datatypes/coding-chip/coding-chip';
import { TimeChoicePipe } from '../../../datatypes/time-choice-pipe';
import {
  CLINICAL_STATUSES,
  clinicalStatusOf,
  conditionDisplayName,
  VERIFICATION_STATUSES,
  verificationStatusOf,
} from '../condition-mapper';

/** Clinical statuses that mean the condition is currently present. */
const ONGOING = new Set(['active', 'recurrence', 'relapse']);
/** Verification statuses that say the diagnosis is not (yet) certain. */
const UNCERTAIN = new Set(['unconfirmed', 'provisional', 'differential']);
/** Verification statuses that say the condition is not real. */
const VOID = new Set(['refuted', 'entered-in-error']);

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
    return code ? { label: CLINICAL_STATUSES[code], ongoing: ONGOING.has(code) } : undefined;
  });

  /** Shown only when it is not the usual "confirmed". */
  protected readonly verification = computed(() => {
    const code = verificationStatusOf(this.condition());
    if (!code || code === 'confirmed') return undefined;
    return { label: VERIFICATION_STATUSES[code], uncertain: UNCERTAIN.has(code) };
  });

  protected readonly isVoid = computed(() => VOID.has(verificationStatusOf(this.condition())));

  protected readonly codings = computed(() =>
    (this.condition().code?.coding ?? []).filter((coding) => coding.code),
  );
}
