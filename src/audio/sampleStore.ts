import { openDb, STORE_SAMPLES, requestToPromise, transactionDone } from "../storage/db";

export type StoredSample = Readonly<{
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
}>;

type StoredSampleRecord = StoredSample & Readonly<{ data: Blob }>;

function randomId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function putSampleFromFile(file: File): Promise<StoredSample> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readwrite");
  const store = tx.objectStore(STORE_SAMPLES);

  const record: StoredSampleRecord = {
    id: randomId(),
    name: file.name || "sample",
    mime: file.type || "application/octet-stream",
    size: file.size,
    createdAt: Date.now(),
    data: file,
  };

  await requestToPromise(store.put(record));
  await transactionDone(tx);

  const { data: _data, ...meta } = record;
  return meta;
}

export async function getSample(id: string): Promise<StoredSampleRecord | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readonly");
  const store = tx.objectStore(STORE_SAMPLES);
  const res = (await requestToPromise(store.get(id))) as StoredSampleRecord | undefined;
  await transactionDone(tx);
  return res ?? null;
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
    .map(({ data: _data, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSample(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readwrite");
  const store = tx.objectStore(STORE_SAMPLES);
  await requestToPromise(store.delete(id));
  await transactionDone(tx);
}
