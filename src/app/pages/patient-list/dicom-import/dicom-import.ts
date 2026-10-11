import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, model, output, signal } from '@angular/core';
import { droppedFiles, PickedFiles, pickDicom } from '../../../pacs/dicom-files';
import { DicomUpload, UploadReport } from '../../../pacs/dicom-upload';
import { PacsSync, PacsSyncReport as SyncReport } from '../../../pacs/pacs-sync';
import { Icon } from '../../../shared/icon/icon';
import { PacsSyncReport } from '../pacs-sync-report/pacs-sync-report';

type Step = 'pick' | 'checking' | 'ready' | 'uploading' | 'linking' | 'done';

/**
 * Imports DICOM files: the user drops or picks files or folders, the DICOM ones are uploaded to
 * the PACS, and the studies they belong to are synced into FHIR, as "Sync with PACS" would do
 * for them alone: each goes to the Patient with its DICOM Patient ID, or to a new one.
 */
@Component({
  imports: [DecimalPipe, Icon, PacsSyncReport],
  selector: 'app-dicom-import',
  styleUrl: './dicom-import.scss',
  templateUrl: './dicom-import.html',
})
export class DicomImport {
  private readonly uploader = inject(DicomUpload);
  private readonly pacsSync = inject(PacsSync);

  readonly open = model(false);
  /** Patients or imaging studies were created or updated: the list may have changed. */
  readonly imported = output<void>();

  protected readonly step = signal<Step>('pick');
  protected readonly picked = signal<PickedFiles>({ dicom: [], skipped: [] });
  protected readonly progress = signal({ done: 0, total: 0 });
  protected readonly upload = signal<UploadReport | undefined>(undefined);
  protected readonly sync = signal<SyncReport | undefined>(undefined);
  protected readonly dragging = signal(false);
  protected readonly error = signal('');

  protected readonly busy = computed(() =>
    ['checking', 'uploading', 'linking'].includes(this.step()),
  );
  protected readonly megabytes = computed(
    () => this.picked().dicom.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024),
  );

  protected async choose(input: HTMLInputElement): Promise<void> {
    await this.check([...(input.files ?? [])]);
    input.value = ''; // so choosing the same files again still counts as a change
  }

  protected async drop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    if (!event.dataTransfer || this.busy()) return;
    let files: File[];
    try {
      files = await droppedFiles(event.dataTransfer);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
      this.step.set('ready');
      return;
    }
    await this.check(files);
  }

  protected dragOver(event: DragEvent): void {
    event.preventDefault(); // allows dropping
    this.dragging.set(true);
  }

  protected async start(): Promise<void> {
    const files = this.picked().dicom;
    this.error.set('');
    try {
      this.step.set('uploading');
      const upload = await this.uploader.upload(files, (done, total) =>
        this.progress.set({ done, total }),
      );
      this.upload.set(upload);

      this.step.set('linking');
      const sync = await this.pacsSync.syncStudies(upload.studyInstanceUids, (done, total) =>
        this.progress.set({ done, total }),
      );
      this.sync.set(sync);
      this.step.set('done');
      if (sync.studies.some((s) => s.outcome === 'created' || s.outcome === 'updated')) {
        this.imported.emit();
      }
    } catch (err) {
      // Both report their failures rather than throwing; this is for the unexpected.
      this.error.set(err instanceof Error ? err.message : String(err));
      this.step.set('ready');
    }
  }

  /** Back to picking files, e.g. to import more. */
  protected reset(): void {
    this.error.set('');
    this.step.set('pick');
    this.picked.set({ dicom: [], skipped: [] });
    this.upload.set(undefined);
    this.sync.set(undefined);
  }

  protected close(): void {
    this.reset();
    this.open.set(false);
  }

  private async check(files: File[]): Promise<void> {
    if (!files.length) return;
    this.error.set('');
    this.step.set('checking');
    try {
      this.picked.set(await pickDicom(files, (done, total) => this.progress.set({ done, total })));
    } catch (err) {
      // pickDicom skips unreadable files itself; this is for the unexpected, e.g. a folder that
      // can't be listed. Never leave the panel stuck on "Checking".
      this.picked.set({ dicom: [], skipped: [] });
      this.error.set(err instanceof Error ? err.message : String(err));
    }
    this.step.set('ready');
  }
}
