import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SequenceMap from "./components/SequenceMap";
import {
  type Feature,
  featureLocationText,
  featureSegments,
  type Location,
  type SequenceRecord,
  sequenceText,
  simpleFeatureRange,
} from "./lib/sequence";
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

interface FeatureDraft {
  index: number | null;
  kind: string;
  label: string;
  start: string;
  end: string;
  reverse: boolean;
  original: Feature | null;
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
          typeof boundary[1] === "object" &&
          boundary[1] !== null &&
          Object.values(boundary[1]).length === 1 &&
          typeof Object.values(boundary[1])[0] === "boolean",
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
      [start, { Before: false }],
      [end, { After: false }],
    ],
  };
  return reverse ? { Complement: range } : range;
}

function featureLabel(feature: Feature): string {
  return (
    feature.qualifiers.find(([key]) =>
      ["label", "gene", "product"].includes(key),
    )?.[1] ?? feature.kind
  );
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const sequenceInput = useRef<HTMLTextAreaElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const [recovery] = useState(loadRecovery);
  const [documents, setDocuments] = useState<EditorDocument[]>(
    recovery.documents,
  );
  const [activeId, setActiveId] = useState<string | null>(
    recovery.documents[0]?.id ?? null,
  );
  const [sequenceDraft, setSequenceDraft] = useState("");
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const [search, setSearch] = useState("");
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [featureDraft, setFeatureDraft] = useState<FeatureDraft | null>(null);
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
          ({ record: item, savedSnapshot }) =>
            recordSnapshot(item) !== savedSnapshot,
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
      id === activeId && sequenceDraft !== sequenceText(closing.record);
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

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
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
      findInput.current?.focus();
    } else if (key === "z" && event.shiftKey) {
      event.preventDefault();
      changeHistory("redo");
    } else if (key === "z") {
      event.preventDefault();
      changeHistory("undo");
    }
  }

  function documentFeatureKey(feature: Feature, index: number): string {
    return `${JSON.stringify(feature)}-${index}`;
  }

  function selectFeature(index: number) {
    if (!record) return;
    setFeatureDraft(null);
    setSelectedFeature(index);
    const feature = record.features[index];
    const parts = featureSegments(feature.location);
    if (parts.length === 0) {
      setError("This feature has no local sequence coordinates to select.");
      return;
    }
    const [segment] = parts;
    const { start, end } = segment;
    setSelection([start, end]);
    setError(
      parts.length > 1
        ? "This feature has multiple segments; the first segment is selected."
        : null,
    );
    requestAnimationFrame(() => {
      sequenceInput.current?.focus();
      sequenceInput.current?.setSelectionRange(start, end);
    });
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

  function findMatch(direction: 1 | -1) {
    if (!record || !search.trim()) return;
    const query = search.trim().toUpperCase();
    const haystack = sequenceDraft.toUpperCase();
    const [start, end] = selection;
    const from =
      direction > 0 ? Math.max(end, start) : Math.min(start, end) - 1;
    let match =
      direction > 0
        ? haystack.indexOf(query, from)
        : haystack.lastIndexOf(query, Math.max(from, 0));
    if (match < 0) {
      match =
        direction > 0
          ? haystack.indexOf(query, 0)
          : haystack.lastIndexOf(query);
    }
    if (match < 0) {
      setError(`No matches for "${search}".`);
      return;
    }
    setError(null);
    const next: [number, number] = [match, match + query.length];
    setSelection(next);
    sequenceInput.current?.focus();
    sequenceInput.current?.setSelectionRange(...next);
  }

  const gcPercent = record?.seq.length
    ? (record.seq.filter(
        (base) => base === 71 || base === 67 || base === 103 || base === 99,
      ).length /
        record.seq.length) *
      100
    : 0;
  const editableSimpleFeature = featureDraft?.original
    ? simpleFeatureRange(featureDraft.original.location) !== null
    : true;

  return (
    <main className="app-shell" onKeyDown={handleKeyDown}>
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Molecular Cloning Studio home"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Molecular Cloning Studio</span>
        </a>
        <div className="toolbar">
          <button
            className="button button-secondary"
            type="button"
            onClick={createRecord}
            disabled={busy}
          >
            New record
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".gb,.gbk,.genbank,.fa,.fasta,.fna"
            onChange={openFile}
            aria-label="Choose a GenBank or FASTA file"
          />
          <button
            className="button button-secondary"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            Open file
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => changeHistory("undo")}
            disabled={
              !activeDocument?.undo.length || busy || sequenceDraft !== bases
            }
            aria-label="Undo"
          >
            Undo
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => changeHistory("redo")}
            disabled={
              !activeDocument?.redo.length || busy || sequenceDraft !== bases
            }
            aria-label="Redo"
          >
            Redo
          </button>
          <select
            className="export-format"
            value={activeDocument?.format ?? "genbank"}
            onChange={(event) => {
              const nextFormat = event.target.value as FileFormat;
              if (activeDocument) {
                setDocuments((current) =>
                  current.map((item) =>
                    item.id === activeDocument.id
                      ? { ...item, format: nextFormat }
                      : item,
                  ),
                );
              }
            }}
            aria-label="Save format"
            disabled={!activeDocument || busy}
          >
            <option value="genbank">GenBank</option>
            <option value="fasta">FASTA</option>
          </select>
          <button
            className="button button-primary"
            type="button"
            onClick={() => saveDocument()}
            disabled={!activeDocument || busy}
          >
            Save {isDirty ? "changes" : "copy"}
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Sequence workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">DOCUMENTS</span>
            <span className="sidebar-count">{documents.length}</span>
          </div>
          {documents.length ? (
            documents.map((item) => {
              const dirty =
                recordSnapshot(item.record) !== item.savedSnapshot ||
                item.draftSequence !== undefined;
              return (
                <div
                  className={`document-tab${activeId === item.id ? " is-active" : ""}`}
                  key={item.id}
                >
                  <button
                    className="tab-select"
                    type="button"
                    onClick={() => activateDocument(item.id)}
                    disabled={busy}
                    aria-current={activeId === item.id ? "page" : undefined}
                  >
                    <span className="record-icon" aria-hidden="true">
                      DNA
                    </span>
                    <span className="record-label">
                      <strong>
                        {item.record.name || "Untitled sequence"}
                        {dirty ? " •" : ""}
                      </strong>
                      <small>
                        {item.record.topology.toLowerCase()} ·{" "}
                        {item.record.seq.length} bp
                      </small>
                    </span>
                  </button>
                  <button
                    className="tab-close"
                    type="button"
                    aria-label={`Close ${item.record.name || "sequence"}`}
                    onClick={() => closeDocument(item.id)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </div>
              );
            })
          ) : (
            <p className="sidebar-empty">
              Create a record or open a sequence to begin.
            </p>
          )}
          <div className="sidebar-footer">
            <span className="status-dot" />
            Local workspace · Recovery enabled
          </div>
        </aside>

        <section className="document" aria-label="Sequence document">
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
          {recovery.documents.length > 0 && (
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
          {!record ? (
            <div className="empty-state">
              <div className="empty-illustration" aria-hidden="true">
                <span className="helix-line helix-line-a" />
                <span className="helix-line helix-line-b" />
                <span className="helix-rung rung-one" />
                <span className="helix-rung rung-two" />
                <span className="helix-rung rung-three" />
              </div>
              <span className="eyebrow">YOUR BENCH, IN ONE PLACE</span>
              <h1>Start with a sequence</h1>
              <p>
                Create a new record or open an annotated GenBank or FASTA file.
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={createRecord}
              >
                Create sequence
              </button>
              <span className="format-note">
                GenBank is recommended for annotated records.
              </span>
            </div>
          ) : (
            activeDocument && (
              <>
                <div
                  className="tab-strip"
                  role="tablist"
                  aria-label="Open documents"
                >
                  {documents.map((item) => (
                    <button
                      className={`tab-strip-item${activeId === item.id ? " is-active" : ""}`}
                      id={`tab-${item.id}`}
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={activeId === item.id}
                      aria-controls={`panel-${item.id}`}
                      onClick={() => activateDocument(item.id)}
                      disabled={busy}
                    >
                      {item.record.name || "Untitled sequence"}
                      {recordSnapshot(item.record) !== item.savedSnapshot ||
                      item.draftSequence !== undefined
                        ? " •"
                        : ""}
                    </button>
                  ))}
                </div>
                <section
                  className="document-panel"
                  id={`panel-${activeDocument.id}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${activeDocument.id}`}
                >
                  <div className="document-header">
                    <div>
                      <span className="eyebrow">
                        SEQUENCE RECORD · {activeDocument.sourceName}
                      </span>
                      <input
                        className="record-title-input"
                        aria-label="Record name"
                        value={record.name ?? ""}
                        onChange={(event) =>
                          updateRecord(activeDocument.id, {
                            ...record,
                            name: event.target.value,
                          })
                        }
                      />
                      {record.definition && <p>{record.definition}</p>}
                    </div>
                    <span className="topology-chip">
                      {record.topology.toLowerCase()}
                    </span>
                  </div>
                  <section
                    className="stats-row"
                    aria-label="Sequence statistics"
                  >
                    <div>
                      <span>Length</span>
                      <strong>
                        {record.seq.length.toLocaleString()} <small>bp</small>
                      </strong>
                    </div>
                    <div>
                      <span>Features</span>
                      <strong>{record.features.length.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>GC content</span>
                      <strong>
                        {gcPercent.toFixed(1)}
                        <small>%</small>
                      </strong>
                    </div>
                    <div>
                      <span>Molecule</span>
                      <strong>{record.molecule_type || "DNA"}</strong>
                    </div>
                  </section>
                  <section
                    className="map-section"
                    aria-labelledby="map-heading"
                  >
                    <div className="section-heading">
                      <h2 id="map-heading">
                        {record.topology === "Circular"
                          ? "Plasmid map"
                          : "Feature overview"}
                      </h2>
                      <span>
                        {record.topology.toLowerCase()} ·{" "}
                        {record.seq.length.toLocaleString()} bp
                      </span>
                    </div>
                    <SequenceMap
                      record={record}
                      selectedFeature={selectedFeature}
                      onSelectFeature={selectFeature}
                    />
                  </section>
                  <section
                    className="feature-section"
                    aria-labelledby="feature-heading"
                  >
                    <div className="section-heading">
                      <h2 id="feature-heading">Annotations</h2>
                      <button
                        className="text-button"
                        type="button"
                        onClick={startNewFeature}
                        disabled={
                          busy ||
                          record.seq.length === 0 ||
                          sequenceDraft !== bases
                        }
                      >
                        + Add feature
                      </button>
                    </div>
                    <div className="feature-list">
                      {record.features.map((feature, index) => (
                        <div
                          className={`feature-row${selectedFeature === index ? " is-selected" : ""}`}
                          key={documentFeatureKey(feature, index)}
                        >
                          <button
                            className="feature-row-select"
                            type="button"
                            onClick={() => startFeatureEdit(index)}
                          >
                            <span
                              className={`feature-marker feature-${feature.kind.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`}
                            />
                            <strong>{featureLabel(feature)}</strong>
                            <span>{feature.kind}</span>
                            <code>{featureLocationText(feature.location)}</code>
                          </button>
                          <button
                            className="feature-edit"
                            type="button"
                            onClick={() => startFeatureEdit(index)}
                            aria-label={`Edit ${featureLabel(feature)}`}
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                      {record.features.length === 0 && (
                        <p className="sidebar-empty">
                          No annotations yet. Select bases and add a feature.
                        </p>
                      )}
                    </div>
                    {featureDraft && (
                      <form
                        className="feature-editor"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveFeature();
                        }}
                      >
                        <label>
                          Type
                          <input
                            value={featureDraft.kind}
                            onChange={(event) =>
                              setFeatureDraft({
                                ...featureDraft,
                                kind: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                        <label>
                          Label
                          <input
                            value={featureDraft.label}
                            onChange={(event) =>
                              setFeatureDraft({
                                ...featureDraft,
                                label: event.target.value,
                              })
                            }
                            placeholder="Optional feature label"
                          />
                        </label>
                        <label>
                          Start (0-based)
                          <input
                            type="number"
                            min="0"
                            max={record.seq.length}
                            value={featureDraft.start}
                            disabled={!editableSimpleFeature}
                            onChange={(event) =>
                              setFeatureDraft({
                                ...featureDraft,
                                start: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                        <label>
                          End (exclusive)
                          <input
                            type="number"
                            min="1"
                            max={record.seq.length}
                            value={featureDraft.end}
                            disabled={!editableSimpleFeature}
                            onChange={(event) =>
                              setFeatureDraft({
                                ...featureDraft,
                                end: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                        {editableSimpleFeature && (
                          <label className="strand-option">
                            <input
                              type="checkbox"
                              checked={featureDraft.reverse}
                              onChange={(event) =>
                                setFeatureDraft({
                                  ...featureDraft,
                                  reverse: event.target.checked,
                                })
                              }
                            />{" "}
                            Reverse strand
                          </label>
                        )}
                        {!editableSimpleFeature && (
                          <p className="format-note">
                            Complex feature locations are preserved; edit their
                            type and label here.
                          </p>
                        )}
                        <div className="editor-actions">
                          <button
                            className="button button-primary"
                            type="submit"
                            disabled={busy || sequenceDraft !== bases}
                          >
                            Save feature
                          </button>
                          {featureDraft.index !== null && (
                            <button
                              className="text-button danger-button"
                              type="button"
                              onClick={() => void removeFeature()}
                              disabled={busy || sequenceDraft !== bases}
                            >
                              Delete
                            </button>
                          )}
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setFeatureDraft(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                  <section
                    className="sequence-section"
                    aria-labelledby="sequence-heading"
                  >
                    <div className="section-heading">
                      <h2 id="sequence-heading">Sequence</h2>
                      <div className="sequence-actions">
                        <label className="find-control">
                          <span className="visually-hidden">Find sequence</span>
                          <input
                            ref={findInput}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                findMatch(event.shiftKey ? -1 : 1);
                            }}
                            placeholder="Find bases…"
                            aria-label="Find bases"
                          />
                        </label>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => findMatch(-1)}
                          disabled={!search}
                        >
                          ↑
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => findMatch(1)}
                          disabled={!search}
                        >
                          ↓
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => void flipStrand()}
                          disabled={busy || sequenceDraft !== bases}
                        >
                          Reverse complement
                        </button>
                      </div>
                    </div>
                    <p className="sequence-hint">
                      Select bases to inspect or annotate. Edit the sequence,
                      then apply the change.
                    </p>
                    <textarea
                      ref={sequenceInput}
                      className="sequence-view"
                      aria-label="Editable nucleotide sequence"
                      value={sequenceDraft}
                      onChange={(event) => {
                        const draft = event.target.value.toUpperCase();
                        setSequenceDraft(draft);
                        setDocuments((current) =>
                          current.map((item) =>
                            item.id === activeDocument.id
                              ? {
                                  ...item,
                                  draftSequence:
                                    draft === bases ? undefined : draft,
                                }
                              : item,
                          ),
                        );
                      }}
                      onSelect={(event) =>
                        setSelection([
                          event.currentTarget.selectionStart,
                          event.currentTarget.selectionEnd,
                        ])
                      }
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      wrap="off"
                    />
                    <div className="sequence-footer">
                      <span>
                        {sequenceDraft.length.toLocaleString()} bases ·
                        selection {selection[0]}..{selection[1]} (0-based)
                      </span>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => void applySequenceEdit()}
                        disabled={busy || sequenceDraft === bases}
                      >
                        Apply sequence edit
                      </button>
                    </div>
                  </section>
                </section>
              </>
            )
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
