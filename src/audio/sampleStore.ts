export type StoredSample = Readonly<{
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
}>;

type StoredSampleRecord = StoredSample & Readonly<{ data: Blob }>;

const DB_NAME = "webaudio-playground";
const DB_VERSION = 1;
const STORE_SAMPLES = "samples";

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
      db.createObjectStore(STORE_SAMPLES, { keyPath: "id" });
    }
  };
  return requestToPromise(req);
}

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
  db.close();

  const { data: _data, ...meta } = record;
  return meta;
}

export async function getSample(id: string): Promise<StoredSampleRecord | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_SAMPLES], "readonly");
  const store = tx.objectStore(STORE_SAMPLES);
  const res = (await requestToPromise(store.get(id))) as StoredSampleRecord | undefined;
  await transactionDone(tx);
  db.close();
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
  db.close();
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
  db.close();
}

