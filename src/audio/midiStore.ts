import { openDb, STORE_MIDI, requestToPromise, transactionDone } from "@storage/db";
import { writeMidiFile, readMidiFile, deleteMidiFile } from "@storage/opfs";

export type StoredMidi = Readonly<{
  id: string;
  name: string;
  size: number;
  createdAt: number;
  durationTicks: number;
  ticksPerBeat: number;
  trackCount: number;
}>;

type StoredMidiRecord = StoredMidi & Readonly<{ opfsPath: string }>;

function randomId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function putMidiFromFile(
  file: File,
  metadata: { durationTicks: number; ticksPerBeat: number; trackCount: number }
): Promise<StoredMidi> {
  const id = randomId();
  const opfsPath = await writeMidiFile(id, file);

  const db = await openDb();
  const tx = db.transaction([STORE_MIDI], "readwrite");
  const store = tx.objectStore(STORE_MIDI);

  const record: StoredMidiRecord = {
    id,
    name: file.name || "midi",
    size: file.size,
    createdAt: Date.now(),
    opfsPath,
    durationTicks: metadata.durationTicks,
    ticksPerBeat: metadata.ticksPerBeat,
    trackCount: metadata.trackCount,
  };

  await requestToPromise(store.put(record));
  await transactionDone(tx);

  const { opfsPath: _path, ...meta } = record;
  return meta;
}

export async function getMidi(id: string): Promise<(StoredMidi & { data: Blob }) | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_MIDI], "readonly");
  const store = tx.objectStore(STORE_MIDI);
  const rec = (await requestToPromise(store.get(id))) as StoredMidiRecord | undefined;
  await transactionDone(tx);

  if (!rec) return null;

  const blob = await readMidiFile(rec.opfsPath);
  if (!blob) return null;

  const { opfsPath: _path, ...meta } = rec;
  return { ...meta, data: blob };
}

export async function getMidiBlob(id: string): Promise<Blob | null> {
  const rec = await getMidi(id);
  return rec?.data ?? null;
}

export async function listMidi(): Promise<ReadonlyArray<StoredMidi>> {
  const db = await openDb();
  const tx = db.transaction([STORE_MIDI], "readonly");
  const store = tx.objectStore(STORE_MIDI);
  const recs = (await requestToPromise(store.getAll())) as StoredMidiRecord[];
  await transactionDone(tx);
  return recs
    .map(({ opfsPath: _path, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteMidi(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_MIDI], "readonly");
  const store = tx.objectStore(STORE_MIDI);
  const rec = (await requestToPromise(store.get(id))) as StoredMidiRecord | undefined;
  await transactionDone(tx);

  if (rec) {
    await deleteMidiFile(rec.opfsPath);

    const deleteTx = db.transaction([STORE_MIDI], "readwrite");
    const deleteStore = deleteTx.objectStore(STORE_MIDI);
    await requestToPromise(deleteStore.delete(id));
    await transactionDone(deleteTx);
  }
}
