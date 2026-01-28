const SAMPLES_DIR = "samples";
const MIDI_DIR = "midi";
const SOUNDFONTS_DIR = "soundfonts";

let rootDirPromise: Promise<FileSystemDirectoryHandle> | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (rootDirPromise) return rootDirPromise;
  rootDirPromise = navigator.storage.getDirectory();
  return rootDirPromise;
}

async function getSamplesDir(): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  return root.getDirectoryHandle(SAMPLES_DIR, { create: true });
}

async function getMidiDir(): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  return root.getDirectoryHandle(MIDI_DIR, { create: true });
}

async function getSoundfontsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  return root.getDirectoryHandle(SOUNDFONTS_DIR, { create: true });
}

export async function writeFile(filename: string, data: Blob): Promise<string> {
  const dir = await getSamplesDir();
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
  return `${SAMPLES_DIR}/${filename}`;
}

export async function readFile(path: string): Promise<Blob | null> {
  try {
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== SAMPLES_DIR) {
      return null;
    }
    const filename = parts[1];
    const dir = await getSamplesDir();
    const fileHandle = await dir.getFileHandle(filename);
    return fileHandle.getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return null;
    }
    throw e;
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== SAMPLES_DIR) {
      return;
    }
    const filename = parts[1];
    const dir = await getSamplesDir();
    await dir.removeEntry(filename);
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return;
    }
    throw e;
  }
}

// MIDI file operations

export async function writeMidiFile(filename: string, data: Blob): Promise<string> {
  const dir = await getMidiDir();
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
  return `${MIDI_DIR}/${filename}`;
}

export async function readMidiFile(path: string): Promise<Blob | null> {
  try {
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== MIDI_DIR) {
      return null;
    }
    const filename = parts[1];
    const dir = await getMidiDir();
    const fileHandle = await dir.getFileHandle(filename);
    return fileHandle.getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return null;
    }
    throw e;
  }
}

export async function deleteMidiFile(path: string): Promise<void> {
  try {
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== MIDI_DIR) {
      return;
    }
    const filename = parts[1];
    const dir = await getMidiDir();
    await dir.removeEntry(filename);
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return;
    }
    throw e;
  }
}

// SoundFont file operations

export async function writeSoundfontFile(
  filename: string,
  data: Blob
): Promise<string> {
  const dir = await getSoundfontsDir();
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
  return `${SOUNDFONTS_DIR}/${filename}`;
}

export async function readSoundfontFile(path: string): Promise<Blob | null> {
  try {
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== SOUNDFONTS_DIR) {
      return null;
    }
    const filename = parts[1];
    const dir = await getSoundfontsDir();
    const fileHandle = await dir.getFileHandle(filename);
    return fileHandle.getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return null;
    }
    throw e;
  }
}

export async function deleteSoundfontFile(path: string): Promise<void> {
  try {
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== SOUNDFONTS_DIR) {
      return;
    }
    const filename = parts[1];
    const dir = await getSoundfontsDir();
    await dir.removeEntry(filename);
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return;
    }
    throw e;
  }
}
