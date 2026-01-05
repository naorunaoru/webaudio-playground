import type { Chunk, StorageAdapterInterface } from "@automerge/automerge-repo";
import { openDb, STORE_DOCUMENTS, requestToPromise, transactionDone } from "./db";

/**
 * Custom storage adapter for Automerge that uses our shared IndexedDB database.
 */
export class DocumentStorageAdapter implements StorageAdapterInterface {
  async load(keyArray: string[]): Promise<Uint8Array | undefined> {
    const db = await openDb();
    const tx = db.transaction(STORE_DOCUMENTS, "readonly");
    const store = tx.objectStore(STORE_DOCUMENTS);
    const result = await requestToPromise(store.get(keyArray));
    await transactionDone(tx);

    if (result && typeof result === "object" && "binary" in result) {
      return (result as { binary: Uint8Array }).binary;
    }
    return undefined;
  }

  async save(keyArray: string[], binary: Uint8Array): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE_DOCUMENTS, "readwrite");
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.put({ key: keyArray, binary }, keyArray);
    await transactionDone(tx);
  }

  async remove(keyArray: string[]): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE_DOCUMENTS, "readwrite");
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.delete(keyArray);
    await transactionDone(tx);
  }

  async loadRange(keyPrefix: string[]): Promise<Chunk[]> {
    const db = await openDb();
    const lowerBound = keyPrefix;
    const upperBound = [...keyPrefix, "\uffff"];
    const range = IDBKeyRange.bound(lowerBound, upperBound);

    const tx = db.transaction(STORE_DOCUMENTS, "readonly");
    const store = tx.objectStore(STORE_DOCUMENTS);
    const request = store.openCursor(range);

    const results: Chunk[] = [];

    await new Promise<void>((resolve, reject) => {
      tx.onerror = () => reject(tx.error);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const value = cursor.value as { binary: Uint8Array };
          results.push({
            data: value.binary,
            key: cursor.key as string[],
          });
          cursor.continue();
        } else {
          resolve();
        }
      };
    });

    return results;
  }

  async removeRange(keyPrefix: string[]): Promise<void> {
    const db = await openDb();
    const lowerBound = keyPrefix;
    const upperBound = [...keyPrefix, "\uffff"];
    const range = IDBKeyRange.bound(lowerBound, upperBound);

    const tx = db.transaction(STORE_DOCUMENTS, "readwrite");
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.delete(range);
    await transactionDone(tx);
  }
}
