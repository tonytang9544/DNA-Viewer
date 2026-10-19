import { useEffect, useRef, useState } from "react";

interface FileMenuProps {
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canEditFeature: boolean;
  canAddFeature: boolean;
  canReverseComplement: boolean;
  canEditSequence: boolean;
  isDirty: boolean;
  saveFormat: "genbank" | "fasta";
  searchQuery: string;
  focusSearchRequest: number;
  onNewRecord: () => void;
  onOpenFile: () => void;
  onSave: (format?: "genbank" | "fasta") => void;
  onUndo: () => void;
  onRedo: () => void;
  onEditSequence: () => void;
  onReverseComplement: () => void;
  onAddFeature: () => void;
  onEditFeature: () => void;
  onDeleteFeature: () => void;
  onSearchChange: (value: string) => void;
  onFind: () => void;
}

export default function FileMenu({
  disabled,
  canUndo,
  canRedo,
  canEditFeature,
  canAddFeature,
  canReverseComplement,
  canEditSequence,
  isDirty,
  saveFormat,
  searchQuery,
  focusSearchRequest,
  onNewRecord,
  onOpenFile,
  onSave,
  onUndo,
  onRedo,
  onEditSequence,
  onReverseComplement,
  onAddFeature,
  onEditFeature,
  onDeleteFeature,
  onSearchChange,
  onFind,
}: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSearchRequest === 0) return;
    setOpen(true);
    requestAnimationFrame(() => searchInput.current?.focus());
  }, [focusSearchRequest]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        root.current &&
        !root.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="file-menu" ref={root}>
      <button
        className={`file-menu-trigger${open ? " is-open" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="file-menu-icon" aria-hidden="true">
          ☰
        </span>
        File
      </button>
      {open && (
        <div
          className="file-menu-popover"
          role="menu"
          aria-label="Application menu"
        >
          <p className="menu-group-label">Document</p>
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => runAction(onNewRecord)}
          >
            New sequence <span>⌘N</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => runAction(onOpenFile)}
          >
            Open file… <span>⌘O</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canEditSequence}
            onClick={() => runAction(() => onSave())}
          >
            Save document ({isDirty ? "changes" : "copy"}){" "}
            <span>{saveFormat.toUpperCase()} · ⌘S</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canEditSequence}
            onClick={() => runAction(() => onSave("genbank"))}
          >
            Export as GenBank
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canEditSequence}
            onClick={() => runAction(() => onSave("fasta"))}
          >
            Export as FASTA
          </button>
          <div className="menu-divider" />
          <p className="menu-group-label">Edit</p>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canEditSequence}
            onClick={() => runAction(onEditSequence)}
          >
            Edit sequence…
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canReverseComplement}
            onClick={() => runAction(onReverseComplement)}
          >
            Reverse complement
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canUndo}
            onClick={() => runAction(onUndo)}
          >
            Undo
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canRedo}
            onClick={() => runAction(onRedo)}
          >
            Redo
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canAddFeature}
            onClick={() => runAction(onAddFeature)}
          >
            Add feature
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canEditFeature}
            onClick={() => runAction(onEditFeature)}
          >
            Edit selected feature
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || !canEditFeature}
            onClick={() => runAction(onDeleteFeature)}
          >
            Delete selected feature
          </button>
          <form
            className="menu-search"
            onSubmit={(event) => {
              event.preventDefault();
              onFind();
            }}
          >
            <label htmlFor="sequence-search">Find bases</label>
            <div>
              <input
                id="sequence-search"
                ref={searchInput}
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Sequence or motif"
                disabled={disabled || !canEditSequence}
              />
              <button type="submit" disabled={disabled || !searchQuery.trim()}>
                Find
              </button>
            </div>
            <small>Enter to find · ⌘F to focus</small>
          </form>
        </div>
      )}
    </div>
  );
}
