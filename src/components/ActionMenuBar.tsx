import { useEffect, useRef, useState } from "react";

type FileFormat = "genbank" | "fasta";
type ViewerMode = "linear" | "circular" | "both";
type MenuName = "File" | "Edit" | "View";

interface ActionMenuBarProps {
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canEditFeature: boolean;
  canAddFeature: boolean;
  canReverseComplement: boolean;
  canEditSequence: boolean;
  isDirty: boolean;
  saveFormat: FileFormat;
  searchQuery: string;
  focusSearchRequest: number;
  viewerMode: ViewerMode;
  onNewRecord: () => void;
  onOpenFile: () => void;
  onSave: (format?: FileFormat) => void;
  onUndo: () => void;
  onRedo: () => void;
  onEditSequence: () => void;
  onReverseComplement: () => void;
  onAddFeature: () => void;
  onEditFeature: () => void;
  onDeleteFeature: () => void;
  onSearchChange: (value: string) => void;
  onFind: () => void;
  onViewerModeChange: (mode: ViewerMode) => void;
}

const menus: { name: MenuName; icon: string }[] = [
  { name: "File", icon: "▤" },
  { name: "Edit", icon: "✎" },
  { name: "View", icon: "◉" },
];

export default function ActionMenuBar({
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
  viewerMode,
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
  onViewerModeChange,
}: ActionMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSearchRequest === 0) return;
    setOpenMenu("Edit");
    requestAnimationFrame(() => searchInput.current?.focus());
  }, [focusSearchRequest]);

  useEffect(() => {
    if (!openMenu) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        root.current &&
        !root.current.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  function runAction(action: () => void) {
    setOpenMenu(null);
    action();
  }

  return (
    <div className="menu-bar" ref={root}>
      {menus.map(({ name, icon }) => (
        <div className="menu-section" key={name}>
          <button
            className={`menu-bar-trigger${openMenu === name ? " is-open" : ""}`}
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === name}
            aria-label={name}
            onClick={() =>
              setOpenMenu((current) => (current === name ? null : name))
            }
          >
            <span className="menu-bar-icon" aria-hidden="true">
              {icon}
            </span>
            {name}
          </button>
          {openMenu === name && (
            <div
              className="menu-popover"
              role="menu"
              aria-label={`${name} menu`}
            >
              {name === "File" && (
                <>
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
                </>
              )}
              {name === "Edit" && (
                <>
                  <p className="menu-group-label">Sequence</p>
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
                  <div className="menu-divider" />
                  <p className="menu-group-label">Features</p>
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
                      <button
                        type="submit"
                        disabled={disabled || !searchQuery.trim()}
                      >
                        Find
                      </button>
                    </div>
                    <small>Enter to find · ⌘F to focus</small>
                  </form>
                </>
              )}
              {name === "View" && (
                <>
                  <p className="menu-group-label">Sequence display</p>
                  {(
                    [
                      ["linear", "Linear sequence"],
                      ["circular", "Circular map"],
                      ["both", "Linear + circular"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={viewerMode === mode}
                      disabled={disabled || !canEditSequence}
                      key={mode}
                      onClick={() => runAction(() => onViewerModeChange(mode))}
                    >
                      {label}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
