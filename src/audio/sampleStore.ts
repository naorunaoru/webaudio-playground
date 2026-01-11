import { openDb, STORE_SAMPLES, requestToPromise, transactionDone } from "@storage/db";
import { writeFile, readFile, deleteFile } from "@storage/opfs";

export type StoredSample = Readonly<{
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
}>;

type StoredSampleRecord = StoredSample & Readonly<{ opfsPath: string }>;

function randomId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function putSampleFromFile(file: File): Promise<StoredSample> {
  const id = randomId();
  const opfsPath = await writeFile(id, file);

  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readwrite");
  const store = tx.objectStore(STORE_SAMPLES);

  const record: StoredSampleRecord = {
    id,
    name: file.name || "sample",
    mime: file.type || "application/octet-stream",
    size: file.size,
    createdAt: Date.now(),
    opfsPath,
  };

  await requestToPromise(store.put(record));
  await transactionDone(tx);

  const { opfsPath: _path, ...meta } = record;
  return meta;
}

export async function getSample(id: string): Promise<(StoredSample & { data: Blob }) | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readonly");
  const store = tx.objectStore(STORE_SAMPLES);
  const rec = (await requestToPromise(store.get(id))) as StoredSampleRecord | undefined;
  await transactionDone(tx);

  if (!rec) return null;

  const blob = await readFile(rec.opfsPath);
  if (!blob) return null;

  const { opfsPath: _path, ...meta } = rec;
  return { ...meta, data: blob };
}

export async function getSampleBlob(id: string): Promise<Blob | null> {
  const rec = await getSample(id);
  return rec?.data ?? null;
}

export async function listSamples(): Promise<ReadonlyArray<StoredSample>> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readonly");
  const store = tx.objectStore(STORE_SAMPLES);
  const recs = (await requestToPromise(store.getAll())) as StoredSampleRecord[];
  await transactionDone(tx);
  return recs
    .map(({ opfsPath: _path, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSample(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readonly");
  const store = tx.objectStore(STORE_SAMPLES);
  const rec = (await requestToPromise(store.get(id))) as StoredSampleRecord | undefined;
  await transactionDone(tx);

  if (rec) {
    await deleteFile(rec.opfsPath);

    const deleteTx = db.transaction([STORE_SAMPLES], "readwrite");
    const deleteStore = deleteTx.objectStore(STORE_SAMPLES);
    await requestToPromise(deleteStore.delete(id));
    await transactionDone(deleteTx);
  }
}
