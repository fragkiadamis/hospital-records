import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  PacsSyncReport as Report,
  StudySyncResult,
  SyncOutcome,
} from '../../../pacs/pacs-sync';
import { Icon } from '../../../shared/icon/icon';

/** Outcomes in the order the summary lists them, with how it names them. */
const OUTCOMES: readonly { outcome: SyncOutcome; label: string }[] = [
  { outcome: 'created', label: 'created' },
  { outcome: 'updated', label: 'updated' },
  { outcome: 'unchanged', label: 'unchanged' },
  { outcome: 'skipped', label: 'skipped' },
  { outcome: 'failed', label: 'failed' },
];

/**
 * What a PACS sync did: counts per outcome, the DICOM studies that were skipped or failed with
 * the reason, and the ImagingStudies whose DICOM study is not in the PACS.
 */
@Component({
  imports: [Icon, RouterLink],
  selector: 'app-pacs-sync-report',
  styleUrl: './pacs-sync-report.scss',
  templateUrl: './pacs-sync-report.html',
})
export class PacsSyncReport {
  readonly report = input.required<Report>();
  /** What produced the report: a full PACS sync, or the sync after a DICOM import. */
  readonly context = input<'sync' | 'import'>('sync');
  readonly dismissed = output<void>();

  protected readonly total = computed(() => this.report().studies.length);

  /** "26 created · 2 unchanged": only the outcomes that happened. */
  protected readonly counts = computed(() =>
    OUTCOMES.map(({ outcome, label }) => ({
      outcome,
      label,
      count: this.report().studies.filter((s) => s.outcome === outcome).length,
    })).filter((c) => c.count > 0),
  );

  protected readonly newPatients = computed(
    () => this.report().studies.filter((s) => s.patientCreated).length,
  );

  /** The DICOM studies someone should look at. */
  protected readonly problems = computed<StudySyncResult[]>(() =>
    this.report().studies.filter((s) => s.outcome === 'skipped' || s.outcome === 'failed'),
  );

  protected readonly hasWarnings = computed(
    () => this.problems().length > 0 || this.report().missingFromPacs.length > 0,
  );
}
