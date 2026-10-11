import { Component, computed, input } from '@angular/core';
import type { Condition } from 'fhir/r4';
import { CodeableConceptPipe } from '../../../datatypes/codeable-concept-pipe';
import { CodingChip } from '../../../datatypes/coding-chip/coding-chip';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import { ReferencePipe } from '../../../datatypes/reference-pipe';
import { TimeChoicePipe } from '../../../datatypes/time-choice-pipe';
import {
  CLINICAL_STATUSES,
  clinicalStatusOf,
  conditionDisplayName,
  isVoid,
  VERIFICATION_STATUSES,
  verificationStatusOf,
} from '../condition-mapper';

/** Everything on a Condition record, read-only. */
@Component({
  imports: [CodeableConceptPipe, CodingChip, FhirDatePipe, ReferencePipe, TimeChoicePipe],
  selector: 'app-condition-detail',
  styleUrl: './condition-detail.scss',
  templateUrl: './condition-detail.html',
})
export class ConditionDetail {
  readonly condition = input.required<Condition>();

  protected readonly name = computed(() => conditionDisplayName(this.condition()));
  protected readonly voided = computed(() => isVoid(this.condition()));

  protected readonly clinicalStatus = computed(() => {
    const code = clinicalStatusOf(this.condition());
    return code ? CLINICAL_STATUSES[code] : '';
  });

  protected readonly verificationStatus = computed(() => {
    const code = verificationStatusOf(this.condition());
    return code ? VERIFICATION_STATUSES[code] : '';
  });

  protected readonly codings = computed(() =>
    (this.condition().code?.coding ?? []).filter((coding) => coding.code),
  );

  /** Resources given as evidence, e.g. the ImagingStudy that showed the condition. */
  protected readonly evidenceDetails = computed(() =>
    (this.condition().evidence ?? []).flatMap((evidence) => evidence.detail ?? []),
  );

  /** Signs or symptoms given as evidence. */
  protected readonly evidenceCodes = computed(() =>
    (this.condition().evidence ?? []).flatMap((evidence) => evidence.code ?? []),
  );
}
