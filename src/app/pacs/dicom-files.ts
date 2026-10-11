// Picking DICOM files in the browser: what was dropped or chosen, and which of it is DICOM.

/** The DICOM files among `files`, and the names of the others. */
export interface PickedFiles {
  dicom: File[];
  /** Files that are not DICOM (or a DICOMDIR, which only indexes the others), by path or name. */
  skipped: string[];
}

/**
 * Whether the file is a DICOM file (DICOM PS3.10): a 128-byte preamble, then "DICM". Only those
 * 4 bytes are read. A DICOMDIR has the marker too, but only indexes a media's files and holds no
 * images, so it doesn't count.
 */
export async function isDicomFile(file: File): Promise<boolean> {
  if (file.name.toUpperCase() === 'DICOMDIR' || file.size < 132) return false;
  const marker = new Uint8Array(await file.slice(128, 132).arrayBuffer());
  return String.fromCharCode(...marker) === 'DICM';
}

/** Sorts files into DICOM and skipped, keeping their order. */
export async function pickDicom(files: readonly File[]): Promise<PickedFiles> {
  const checks = await Promise.all(files.map(isDicomFile));
  return {
    dicom: files.filter((_, i) => checks[i]),
    skipped: files.filter((_, i) => !checks[i]).map(filePath),
  };
}

/** Where the file was within a picked folder, or just its name. */
export function filePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

/**
 * Every file dropped: files as they are, and the files inside dropped folders, at any depth.
 * Browsers expose dropped folders only through the (non-standard but universal) entry API.
 */
export async function droppedFiles(data: DataTransfer): Promise<File[]> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.length) return [...data.files];
  return (await Promise.all(entries.map(filesIn))).flat();
}

async function filesIn(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [
      await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      ),
    ];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns a folder's entries a chunk at a time, then an empty array.
  for (;;) {
    const chunk = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!chunk.length) break;
    children.push(...chunk);
  }
  return (await Promise.all(children.map(filesIn))).flat();
}
