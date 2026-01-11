import { Repo, type DocHandle, type DocumentId } from "@automerge/automerge-repo";
import type { GraphDoc } from "./types";
import { graphStateToDoc } from "./converters";
import { initialGraph } from "../graph/initialGraph";
import { DocumentStorageAdapter, openDb } from "../storage";

const CURRENT_DOC_KEY = "webaudio-playground:current-doc-id";

let repoInstance: Repo | null = null;

/**
 * Get the singleton Automerge Repo with IndexedDB storage.
 */
export function getRepo(): Repo {
  if (!repoInstance) {
    const storage = new DocumentStorageAdapter();
    repoInstance = new Repo({ storage });
  }
  return repoInstance;
}

/**
 * Wait for storage to be ready.
 * Call this before performing operations that require persistence.
 */
export async function waitForStorageReady(): Promise<void> {
  // Ensure the shared database is initialized with all object stores
  await openDb();
}

/**
 * Get the stored document ID from localStorage.
 */
export function getStoredDocId(): DocumentId | null {
  const stored = localStorage.getItem(CURRENT_DOC_KEY);
  return stored ? (stored as DocumentId) : null;
}

/**
 * Store the current document ID in localStorage.
 */
export function setStoredDocId(docId: DocumentId): void {
  localStorage.setItem(CURRENT_DOC_KEY, docId);
}

/**
 * Clear the stored document ID.
 */
export function clearStoredDocId(): void {
  localStorage.removeItem(CURRENT_DOC_KEY);
}

/**
 * Get or create the main document.
 * Returns the document handle and whether it's a new document.
 */
export async function getOrCreateMainDocument(
  repo: Repo
): Promise<{ handle: DocHandle<GraphDoc>; isNew: boolean }> {
  const storedId = getStoredDocId();

  if (storedId) {
    try {
      const handle = await repo.find<GraphDoc>(storedId);
      const doc = handle.doc();
      if (doc && doc.nodes && doc.connections) {
        // Migrate older documents that don't have nodeZOrder
        if (!doc.nodeZOrder) {
          handle.change((d) => {
            d.nodeZOrder = {};
          });
        }
        return { handle, isNew: false };
      }
    } catch {
      // Document not found or invalid, create new one
    }
  }

  // Create new document with initial graph
  const initialDoc = graphStateToDoc(initialGraph());
  const handle = repo.create<GraphDoc>(initialDoc);
  setStoredDocId(handle.documentId);

  return { handle, isNew: true };
}

/**
 * Create a new document and set it as current.
 */
export function createNewDocument(repo: Repo): DocHandle<GraphDoc> {
  const initialDoc = graphStateToDoc(initialGraph());
  const handle = repo.create<GraphDoc>(initialDoc);
  setStoredDocId(handle.documentId);
  return handle;
}

/**
 * Create a document from imported GraphState and set it as current.
 */
export function createDocumentFromImport(
  repo: Repo,
  doc: GraphDoc
): DocHandle<GraphDoc> {
  const handle = repo.create<GraphDoc>(doc);
  setStoredDocId(handle.documentId);
  return handle;
}
