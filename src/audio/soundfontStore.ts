import {
  openDb,
  STORE_SOUNDFONTS,
  requestToPromise,
  transactionDone,
} from "@storage/db";
import {
  writeSoundfontFile,
  readSoundfontFile,
  deleteSoundfontFile,
} from "@storage/opfs";

export type StoredSoundfont = Readonly<{
  id: string;
  name: string;
  size: number;
  createdAt: number;
}>;

type StoredSoundfontRecord = StoredSoundfont & Readonly<{ opfsPath: string }>;

function randomId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function putSoundfontFromFile(file: File): Promise<StoredSoundfont> {
  const id = randomId();
  const opfsPath = await writeSoundfontFile(id, file);

  const db = await openDb();
  const tx = db.transaction([STORE_SOUNDFONTS], "readwrite");
  const store = tx.objectStore(STORE_SOUNDFONTS);

  const record: StoredSoundfontRecord = {
    id,
    name: file.name || "soundfont.sf2",
    size: file.size,
    createdAt: Date.now(),
    opfsPath,
  };

  await requestToPromise(store.put(record));
  await transactionDone(tx);

  const { opfsPath: _path, ...meta } = record;
  return meta;
}

export async function getSoundfont(
  id: string
): Promise<(StoredSoundfont & { data: Blob }) | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_SOUNDFONTS], "readonly");
  const store = tx.objectStore(STORE_SOUNDFONTS);
  const rec = (await requestToPromise(store.get(id))) as
    | StoredSoundfontRecord
    | undefined;
  await transactionDone(tx);

  if (!rec) return null;

  const blob = await readSoundfontFile(rec.opfsPath);
  if (!blob) return null;

  const { opfsPath: _path, ...meta } = rec;
  return { ...meta, data: blob };
}

export async function getSoundfontBlob(id: string): Promise<Blob | null> {
  const rec = await getSoundfont(id);
  return rec?.data ?? null;
}

export async function listSoundfonts(): Promise<ReadonlyArray<StoredSoundfont>> {
  const db = await openDb();
  const tx = db.transaction([STORE_SOUNDFONTS], "readonly");
  const store = tx.objectStore(STORE_SOUNDFONTS);
  const recs = (await requestToPromise(store.getAll())) as StoredSoundfontRecord[];
  await transactionDone(tx);
  return recs
    .map(({ opfsPath: _path, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSoundfont(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_SOUNDFONTS], "readonly");
  const store = tx.objectStore(STORE_SOUNDFONTS);
  const rec = (await requestToPromise(store.get(id))) as
    | StoredSoundfontRecord
    | undefined;
  await transactionDone(tx);

  if (rec) {
    await deleteSoundfontFile(rec.opfsPath);

    const deleteTx = db.transaction([STORE_SOUNDFONTS], "readwrite");
    const deleteStore = deleteTx.objectStore(STORE_SOUNDFONTS);
    await requestToPromise(deleteStore.delete(id));
    await transactionDone(deleteTx);
  }
}
