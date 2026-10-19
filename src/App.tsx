import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ActionMenuBar from "./components/ActionMenuBar";
import DocumentTabs, { type OpenDocumentTab } from "./components/DocumentTabs";
import FeatureEditorDialog, {
  type FeatureDraft,
} from "./components/FeatureEditorDialog";
import SequenceEditorDialog from "./components/SequenceEditorDialog";
import SequenceWorkspace from "./components/SequenceWorkspace";
import {
  type Feature,
  featureSegments,
  type Location,
  type SequenceRecord,
  sequenceText,
  simpleFeatureRange,
} from "./lib/sequence";
import { featureLabel } from "./lib/seqviz";
import {
  addFeature,
  deleteFeature,
  newRecord,
  parseFasta,
  parseGenbank,
  replaceSequence,
  reverseComplement,
  updateFeature,
  writeFasta,
  writeGenbank,
} from "./lib/tauri";

type FileFormat = "genbank" | "fasta";
type ViewerMode = "linear" | "circular" | "both";

interface EditorDocument {
  id: string;
  record: SequenceRecord;
  format: FileFormat;
  sourceName: string;
  savedSnapshot: string;
  draftSequence?: string;
  undo: SequenceRecord[];
  redo: SequenceRecord[];
}

interface RecoveryState {
  documents: EditorDocument[];
  error: string | null;
}

const RECOVERY_KEY = "molecular-cloning-studio.recovery.v1";
const MAX_HISTORY = 10;

function recordSnapshot(record: SequenceRecord): string {
  return JSON.stringify(record);
}

function loadRecovery(): RecoveryState {
  try {
    const stored = localStorage.getItem(RECOVERY_KEY);
    if (!stored) return { documents: [], error: null };
    const documents: unknown = JSON.parse(stored);
    if (!Array.isArray(documents)) {
      throw new Error("The saved recovery data is not a document list.");
    }
    if (!documents.every(isEditorDocument)) {
      throw new Error("The saved recovery data is incomplete.");
    }
    return { documents, error: null };
  } catch (cause) {
    return {
      documents: [],
      error: `Saved recovery data could not be loaded: ${String(cause)}`,
    };
  }
}

function isSequenceRecord(value: unknown): value is SequenceRecord {
  if (typeof value !== "object" || value === null) return false;
  return (
    "seq" in value &&
    Array.isArray(value.seq) &&
    value.seq.every(
      (base) => Number.isInteger(base) && base >= 0 && base <= 255,
    ) &&
    "features" in value &&
    Array.isArray(value.features) &&
    value.features.every(isFeature) &&
    "name" in value &&
    (value.name === null || typeof value.name === "string") &&
    "definition" in value &&
    (value.definition === null || typeof value.definition === "string") &&
    "molecule_type" in value &&
    (value.molecule_type === null || typeof value.molecule_type === "string") &&
    "topology" in value &&
    (value.topology === "Linear" || value.topology === "Circular")
  );
}

function isFeature(value: unknown): value is Feature {
  if (typeof value !== "object" || value === null) return false;
  return (
    "kind" in value &&
    typeof value.kind === "string" &&
    "location" in value &&
    isLocation(value.location) &&
    "qualifiers" in value &&
    Array.isArray(value.qualifiers) &&
    value.qualifiers.every(
      (qualifier) =>
        Array.isArray(qualifier) &&
        qualifier.length === 2 &&
        typeof qualifier[0] === "string" &&
        (qualifier[1] === null || typeof qualifier[1] === "string"),
    )
  );
}

function isLocation(value: unknown): value is Location {
  if (typeof value !== "object" || value === null) return false;
  const entries = Object.entries(value);
  if (entries.length !== 1) return false;
  const [kind, coordinates] = entries[0];
  if (kind === "Range") {
    return (
      Array.isArray(coordinates) &&
      coordinates.length === 2 &&
      coordinates.every(
        (boundary) =>
          Array.isArray(boundary) &&
          boundary.length === 2 &&
          Number.isInteger(boundary[0]) &&
          typeof boundary[1] === "boolean",
      )
    );
  }
  if (kind === "Between") {
    return (
      Array.isArray(coordinates) &&
      coordinates.length === 2 &&
      coordinates.every(Number.isInteger)
    );
  }
  if (kind === "Complement") return isLocation(coordinates);
  if (["Join", "Order", "Bond", "OneOf"].includes(kind)) {
    return Array.isArray(coordinates) && coordinates.every(isLocation);
  }
  if (kind === "External") {
    return (
      Array.isArray(coordinates) &&
      coordinates.length === 2 &&
      typeof coordinates[0] === "string" &&
      (coordinates[1] === null || isLocation(coordinates[1]))
    );
  }
  if (kind === "Gap") {
    return (
      coordinates === "Unknown" ||
      coordinates === "Unk100" ||
      (typeof coordinates === "object" &&
        coordinates !== null &&
        "Known" in coordinates &&
        Number.isInteger(coordinates.Known))
    );
  }
  return false;
}

function isEditorDocument(value: unknown): value is EditorDocument {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "record" in value &&
    isSequenceRecord(value.record) &&
    "format" in value &&
    (value.format === "genbank" || value.format === "fasta") &&
    "sourceName" in value &&
    typeof value.sourceName === "string" &&
    "savedSnapshot" in value &&
    typeof value.savedSnapshot === "string" &&
    (!("draftSequence" in value) || typeof value.draftSequence === "string") &&
    "undo" in value &&
    Array.isArray(value.undo) &&
    value.undo.every(isSequenceRecord) &&
    "redo" in value &&
    Array.isArray(value.redo) &&
    value.redo.every(isSequenceRecord)
  );
}

function createDocument(
  record: SequenceRecord,
  format: FileFormat,
  sourceName: string,
  saved: boolean,
): EditorDocument {
  return {
    id: crypto.randomUUID(),
    record,
    format,
    sourceName,
    savedSnapshot: saved ? recordSnapshot(record) : "",
    undo: [],
    redo: [],
  };
}

function changedRange(before: string, after: string) {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start += 1;
  }
  let oldEnd = before.length;
  let newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return { start, end: oldEnd, replacement: after.slice(start, newEnd) };
}

function locationFromRange(
  start: number,
  end: number,
  reverse: boolean,
): Location {
  const range: Location = {
    Range: [
      [start, false],
      [end, false],
    ],
  };
  return reverse ? { Complement: range } : range;
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const shortcutHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  const [recovery] = useState(loadRecovery);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(
    recovery.documents.length > 0,
  );
  const [documents, setDocuments] = useState<EditorDocument[]>(
    recovery.documents,
  );
  const [activeId, setActiveId] = useState<string | null>(
    recovery.documents[0]?.id ?? null,
  );
  const [sequenceDraft, setSequenceDraft] = useState("");
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("linear");
  const [search, setSearch] = useState("");
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [featureDraft, setFeatureDraft] = useState<FeatureDraft | null>(null);
  const [sequenceEditorOpen, setSequenceEditorOpen] = useState(false);
  const [focusSearchRequest, setFocusSearchRequest] = useState(0);
  const [error, setError] = useState<string | null>(recovery.error);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeDocument = documents.find(({ id }) => id === activeId) ?? null;
  const record = activeDocument?.record ?? null;
  const recoveredSequenceDraft = activeDocument?.draftSequence;
  const bases = useMemo(() => (record ? sequenceText(record) : ""), [record]);
  const isDirty = activeDocument
    ? recordSnapshot(activeDocument.record) !== activeDocument.savedSnapshot ||
      sequenceDraft !== bases
    : false;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcutHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!showRecoveryNotice) return;
    const timeout = window.setTimeout(() => setShowRecoveryNotice(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [showRecoveryNotice]);

  useEffect(() => {
    shortcutHandler.current = handleKeyDown;
  });

  useEffect(() => {
    setSequenceDraft(recoveredSequenceDraft ?? bases);
  }, [recoveredSequenceDraft, bases]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        if (documents.length) {
          localStorage.setItem(RECOVERY_KEY, JSON.stringify(documents));
        } else {
          localStorage.removeItem(RECOVERY_KEY);
        }
        setStorageError(null);
      } catch (cause) {
        setStorageError(`Autosave is unavailable: ${String(cause)}`);
      }
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [documents]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        documents.some(
          ({ record: item, savedSnapshot, draftSequence }) =>
            recordSnapshot(item) !== savedSnapshot ||
            draftSequence !== undefined,
        ) ||
        (activeDocument !== null &&
          sequenceDraft !== sequenceText(activeDocument.record))
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [documents, activeDocument, sequenceDraft]);

  const updateRecord = useCallback(
    (id: string, nextRecord: SequenceRecord, clearDraft = false) => {
      setDocuments((current) =>
        current.map((document) => {
          if (document.id !== id) return document;
          if (recordSnapshot(document.record) === recordSnapshot(nextRecord))
            return document;
          return {
            ...document,
            record: nextRecord,
            draftSequence: clearDraft ? undefined : document.draftSequence,
            undo: [...document.undo, document.record].slice(-MAX_HISTORY),
            redo: [],
          };
        }),
      );
      setError(null);
    },
    [],
  );

  function showError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : String(cause));
  }

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const contents = await file.text();
      const isFasta = /\.(fa|fasta|fna)$/i.test(file.name);
      const parsed = isFasta
        ? await parseFasta(contents)
        : await parseGenbank(contents);
      const document = createDocument(
        parsed,
        isFasta ? "fasta" : "genbank",
        file.name,
        true,
      );
      setDocuments((current) => [...current, document]);
      activateDocument(document.id);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function createRecord() {
    setBusy(true);
    setError(null);
    try {
      const created = await newRecord("Untitled sequence");
      const document = createDocument(
        created,
        "genbank",
        "Untitled sequence",
        false,
      );
      setDocuments((current) => [...current, document]);
      activateDocument(document.id);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function saveDocument(
    format: FileFormat = activeDocument?.format ?? "genbank",
  ) {
    if (!activeDocument) return;
    try {
      let recordToSave = activeDocument.record;
      if (sequenceDraft !== bases) {
        const edited = await applySequenceEdit();
        if (!edited) return;
        recordToSave = edited;
      }
      setBusy(true);
      setError(null);
      const contents =
        format === "genbank"
          ? await writeGenbank(recordToSave)
          : await writeFasta(recordToSave);
      const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${recordToSave.name || "sequence"}.${format === "genbank" ? "gb" : "fasta"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (format === activeDocument.format) {
        setDocuments((current) =>
          current.map((item) =>
            item.id === activeDocument.id
              ? { ...item, savedSnapshot: recordSnapshot(recordToSave) }
              : item,
          ),
        );
      }
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  function closeDocument(id: string) {
    const closing = documents.find((item) => item.id === id);
    if (!closing) return;
    const hasDraft =
      closing.draftSequence !== undefined ||
      (id === activeId && sequenceDraft !== sequenceText(closing.record));
    const isDirty =
      hasDraft || recordSnapshot(closing.record) !== closing.savedSnapshot;
    if (
      isDirty &&
      !window.confirm(
        `Discard unsaved changes to "${closing.record.name || "Untitled sequence"}"?`,
      )
    ) {
      return;
    }
    setDocuments((current) => {
      const remaining = current.filter((item) => item.id !== id);
      if (id === activeId) {
        const index = current.findIndex((item) => item.id === id);
        setActiveId(remaining[Math.max(0, index - 1)]?.id ?? null);
        setSelection([0, 0]);
        setFeatureDraft(null);
        setSelectedFeature(null);
      }
      return remaining;
    });
  }

  async function applySequenceEdit() {
    if (!activeDocument || sequenceDraft === bases || busy) return null;
    const diff = changedRange(bases, sequenceDraft);
    setBusy(true);
    setError(null);
    try {
      const next = await replaceSequence(
        activeDocument.record,
        diff.start,
        diff.end,
        diff.replacement,
      );
      updateRecord(activeDocument.id, next, true);
      setSequenceDraft(sequenceText(next));
      setFeatureDraft(null);
      setSelectedFeature(null);
      setSelection([
        diff.start + diff.replacement.length,
        diff.start + diff.replacement.length,
      ]);
      return next;
    } catch (cause) {
      showError(cause);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function activateDocument(id: string) {
    if (id === activeId) return;
    if (sequenceDraft !== bases) {
      if (
        !window.confirm(
          "Apply the pending sequence edit before switching documents?",
        )
      ) {
        return;
      }
      void applySequenceEdit().then((edited) => {
        if (edited) {
          setSelection([0, 0]);
          setFeatureDraft(null);
          setSelectedFeature(null);
          setActiveId(id);
        }
      });
      return;
    }
    setSelection([0, 0]);
    setFeatureDraft(null);
    setSelectedFeature(null);
    setActiveId(id);
  }

  async function flipStrand() {
    if (!activeDocument || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reversed = await reverseComplement(activeDocument.record);
      updateRecord(activeDocument.id, reversed);
      setSelection([0, 0]);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  function changeHistory(direction: "undo" | "redo") {
    if (!activeDocument) return;
    if (sequenceDraft !== bases) {
      setError(
        "Apply or discard the pending sequence edit before using undo or redo.",
      );
      return;
    }
    setDocuments((current) =>
      current.map((item) => {
        if (item.id !== activeDocument.id) return item;
        if (direction === "undo" && item.undo.length) {
          const restored = item.undo[item.undo.length - 1];
          return {
            ...item,
            record: restored,
            undo: item.undo.slice(0, -1),
            redo: [...item.redo, item.record].slice(-MAX_HISTORY),
          };
        }

        if (direction === "redo" && item.redo.length) {
          const restored = item.redo[item.redo.length - 1];
          return {
            ...item,
            record: restored,
            undo: [...item.undo, item.record].slice(-MAX_HISTORY),
            redo: item.redo.slice(0, -1),
          };
        }
        return item;
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const editingText =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;
    if (editingText && !["s", "o", "f"].includes(key)) return;
    if (key === "s") {
      event.preventDefault();
      void saveDocument();
    } else if (key === "n") {
      event.preventDefault();
      void createRecord();
    } else if (key === "o") {
      event.preventDefault();
      fileInput.current?.click();
    } else if (key === "f") {
      event.preventDefault();
      setFocusSearchRequest((current) => current + 1);
    } else if (key === "z" && event.shiftKey) {
      event.preventDefault();
      changeHistory("redo");
    } else if (key === "z") {
      event.preventDefault();
      changeHistory("undo");
    }
  }

  function handleViewerSelection(
    range: [number, number],
    featureIndex: number | null,
  ) {
    setSelection(range);
    setSelectedFeature(featureIndex);
  }

  function startFeatureEdit(index: number) {
    if (!record) return;
    setSelectedFeature(index);
    const feature = record.features[index];
    const range = simpleFeatureRange(feature.location);
    const segments = featureSegments(feature.location);
    if (!range && segments.length === 0) {
      setError("This feature has no editable local sequence coordinates.");
      return;
    }
    setFeatureDraft({
      index,
      kind: feature.kind,
      label: featureLabel(feature),
      start: String(
        range?.start ?? Math.min(...segments.map((part) => part.start)),
      ),
      end: String(range?.end ?? Math.max(...segments.map((part) => part.end))),
      reverse: range?.reverse ?? false,
      original: feature,
    });
    setSelection([0, 0]);
  }

  function startNewFeature() {
    if (!record || record.seq.length === 0) return;
    const [selectedStart, selectedEnd] = selection;
    const start = selectedStart < selectedEnd ? selectedStart : 0;
    const end =
      selectedStart < selectedEnd
        ? selectedEnd
        : Math.min(record.seq.length, 3);
    setFeatureDraft({
      index: null,
      kind: "misc_feature",
      label: "",
      start: String(start),
      end: String(end),
      reverse: false,
      original: null,
    });
  }

  async function saveFeature() {
    if (!activeDocument || !featureDraft || busy) return;
    const start = Number(featureDraft.start);
    const end = Number(featureDraft.end);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > activeDocument.record.seq.length
    ) {
      setError(
        `Enter a valid zero-based range from 0 to ${activeDocument.record.seq.length}.`,
      );
      return;
    }
    const labelKey =
      featureDraft.original?.qualifiers.find(([key]) =>
        ["label", "gene"].includes(key),
      )?.[0] ?? "label";
    const qualifiers =
      featureDraft.original?.qualifiers.filter(([key]) => key !== labelKey) ??
      [];
    if (featureDraft.label.trim()) {
      qualifiers.push([labelKey, featureDraft.label.trim()]);
    }
    const feature: Feature = {
      kind: featureDraft.kind.trim(),
      location:
        featureDraft.original &&
        !simpleFeatureRange(featureDraft.original.location)
          ? featureDraft.original.location
          : locationFromRange(start, end, featureDraft.reverse),
      qualifiers,
    };
    setBusy(true);
    setError(null);
    try {
      const next =
        featureDraft.index === null
          ? await addFeature(activeDocument.record, feature)
          : await updateFeature(
              activeDocument.record,
              featureDraft.index,
              feature,
            );
      updateRecord(activeDocument.id, next);
      setFeatureDraft(null);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function removeFeature() {
    if (
      !activeDocument ||
      featureDraft?.index === null ||
      !featureDraft ||
      busy
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const next = await deleteFeature(
        activeDocument.record,
        featureDraft.index,
      );
      updateRecord(activeDocument.id, next);
      setFeatureDraft(null);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedFeature() {
    if (!activeDocument || selectedFeature === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await deleteFeature(activeDocument.record, selectedFeature);
      updateRecord(activeDocument.id, next);
      setSelectedFeature(null);
      setSelection([0, 0]);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  function updateSequenceDraft(draft: string) {
    setSequenceDraft(draft);
    if (!activeDocument) return;
    setDocuments((current) =>
      current.map((item) =>
        item.id === activeDocument.id
          ? {
              ...item,
              draftSequence: draft === bases ? undefined : draft,
            }
          : item,
      ),
    );
  }

  function discardSequenceDraft() {
    updateSequenceDraft(bases);
    setSequenceEditorOpen(false);
  }

  async function applySequenceDraft() {
    const updated = await applySequenceEdit();
    if (updated) setSequenceEditorOpen(false);
  }

  function findMatch() {
    if (!record || !search.trim()) return;
    const query = search.trim().toUpperCase();
    const haystack = sequenceDraft.toUpperCase();
    const from = Math.max(selection[1], selection[0]);
    let match = haystack.indexOf(query, from);
    if (match < 0) match = haystack.indexOf(query, 0);
    if (match < 0) {
      setError(`No matches for "${search}".`);
      return;
    }
    setError(null);
    const next: [number, number] = [match, match + query.length];
    setSelection(next);
    setSelectedFeature(null);
    setError(null);
  }

  const editableSimpleFeature = featureDraft?.original
    ? simpleFeatureRange(featureDraft.original.location) !== null
    : true;

  const documentTabs: OpenDocumentTab[] = documents.map((document) => ({
    id: document.id,
    name: document.record.name ?? "",
    dirty:
      recordSnapshot(document.record) !== document.savedSnapshot ||
      document.draftSequence !== undefined,
  }));
  const canEditSequence = activeDocument !== null;
  const canEditCurrentRecord =
    activeDocument !== null && sequenceDraft === bases && !busy;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application actions">
        <div className="sidebar-brand" aria-hidden="true">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".gb,.gbk,.genbank,.fa,.fasta,.fna"
          onChange={openFile}
          aria-label="Choose a GenBank or FASTA file"
        />
        <ActionMenuBar
          disabled={busy}
          canUndo={!!activeDocument?.undo.length && sequenceDraft === bases}
          canRedo={!!activeDocument?.redo.length && sequenceDraft === bases}
          canEditFeature={selectedFeature !== null && canEditCurrentRecord}
          canAddFeature={
            canEditCurrentRecord && !!record && record.seq.length > 0
          }
          canReverseComplement={canEditCurrentRecord}
          canEditSequence={canEditSequence}
          isDirty={isDirty}
          saveFormat={activeDocument?.format ?? "genbank"}
          searchQuery={search}
          focusSearchRequest={focusSearchRequest}
          viewerMode={viewerMode}
          onNewRecord={() => void createRecord()}
          onOpenFile={() => fileInput.current?.click()}
          onSave={(format) => void saveDocument(format)}
          onUndo={() => changeHistory("undo")}
          onRedo={() => changeHistory("redo")}
          onEditSequence={() => setSequenceEditorOpen(true)}
          onReverseComplement={() => void flipStrand()}
          onAddFeature={startNewFeature}
          onEditFeature={() => {
            if (selectedFeature !== null) startFeatureEdit(selectedFeature);
          }}
          onDeleteFeature={() => void deleteSelectedFeature()}
          onSearchChange={setSearch}
          onFind={findMatch}
          onViewerModeChange={setViewerMode}
        />
        <div className="sidebar-footer" title="Documents are recovered locally">
          <span className="status-dot" />
          Local recovery
        </div>
      </aside>

      <div className="main-column">
        <DocumentTabs
          documents={documentTabs}
          activeId={activeId}
          disabled={busy}
          onActivate={activateDocument}
          onClose={closeDocument}
        />
        <main className="workspace" aria-label="Sequence workspace">
          <section
            className="document"
            aria-label="Sequence document"
            id={
              activeDocument ? `document-panel-${activeDocument.id}` : undefined
            }
            role={activeDocument ? "tabpanel" : undefined}
            aria-labelledby={
              activeDocument ? `tab-${activeDocument.id}` : undefined
            }
          >
            {(error || storageError) && (
              <div className="error-banner" role="alert">
                <strong>
                  {error
                    ? "Could not complete that action."
                    : "Recovery warning."}
                </strong>
                <span>{error ?? storageError}</span>
              </div>
            )}
            {showRecoveryNotice && (
              <div className="recovery-notice" role="status">
                Restored {recovery.documents.length} document
                {recovery.documents.length === 1 ? "" : "s"} from this device.
              </div>
            )}
            {busy && (
              <div className="busy-indicator" role="status">
                Processing sequence…
              </div>
            )}
            {record ? (
              <SequenceWorkspace
                record={record}
                selectedRange={selection}
                searchQuery={search}
                viewerMode={viewerMode}
                onSelectionChange={handleViewerSelection}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-illustration" aria-hidden="true">
                  <span className="helix-line helix-line-a" />
                  <span className="helix-line helix-line-b" />
                  <span className="helix-rung rung-one" />
                  <span className="helix-rung rung-two" />
                  <span className="helix-rung rung-three" />
                </div>
                <span className="eyebrow">LOCAL SEQUENCE WORKSPACE</span>
                <h1>Start with a sequence</h1>
                <p>
                  Use the File menu to create a record or open a GenBank or
                  FASTA file.
                </p>
              </div>
            )}
          </section>
        </main>
      </div>

      {sequenceEditorOpen && activeDocument && (
        <SequenceEditorDialog
          value={sequenceDraft}
          busy={busy}
          onChange={updateSequenceDraft}
          onApply={() => void applySequenceDraft()}
          onCancel={discardSequenceDraft}
        />
      )}
      {featureDraft && record && (
        <FeatureEditorDialog
          draft={featureDraft}
          sequenceLength={record.seq.length}
          busy={busy}
          editableRange={editableSimpleFeature}
          onChange={setFeatureDraft}
          onSave={() => void saveFeature()}
          onDelete={() => void removeFeature()}
          onClose={() => setFeatureDraft(null)}
        />
      )}
    </div>
  );
}

export default App;
