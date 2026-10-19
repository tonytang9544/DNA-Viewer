import type { Feature } from "../lib/sequence";

export interface FeatureDraft {
  index: number | null;
  kind: string;
  label: string;
  start: string;
  end: string;
  reverse: boolean;
  original: Feature | null;
}

interface FeatureEditorDialogProps {
  draft: FeatureDraft;
  sequenceLength: number;
  busy: boolean;
  editableRange: boolean;
  onChange: (draft: FeatureDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function FeatureEditorDialog({
  draft,
  sequenceLength,
  busy,
  editableRange,
  onChange,
  onSave,
  onDelete,
  onClose,
}: FeatureEditorDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="editor-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">ANNOTATION</span>
            <h2 id="feature-dialog-title">
              {draft.index === null ? "Add feature" : "Edit feature"}
            </h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            onClick={onClose}
            aria-label="Close feature editor"
          >
            ×
          </button>
        </div>
        <div className="feature-editor-fields">
          <label>
            Type
            <input
              value={draft.kind}
              onChange={(event) =>
                onChange({ ...draft, kind: event.target.value })
              }
              required
            />
          </label>
          <label>
            Label
            <input
              value={draft.label}
              onChange={(event) =>
                onChange({ ...draft, label: event.target.value })
              }
              placeholder="Optional feature label"
            />
          </label>
          <label>
            Start (0-based)
            <input
              type="number"
              min="0"
              max={sequenceLength}
              value={draft.start}
              disabled={!editableRange}
              onChange={(event) =>
                onChange({ ...draft, start: event.target.value })
              }
              required
            />
          </label>
          <label>
            End (exclusive)
            <input
              type="number"
              min="1"
              max={sequenceLength}
              value={draft.end}
              disabled={!editableRange}
              onChange={(event) =>
                onChange({ ...draft, end: event.target.value })
              }
              required
            />
          </label>
          {editableRange ? (
            <label className="strand-option">
              <input
                type="checkbox"
                checked={draft.reverse}
                onChange={(event) =>
                  onChange({ ...draft, reverse: event.target.checked })
                }
              />
              Reverse strand
            </label>
          ) : (
            <p className="format-note">
              Complex feature locations are preserved; only type and label can
              be edited here.
            </p>
          )}
        </div>
        <div className="dialog-actions">
          {draft.index !== null && (
            <button
              className="text-button danger-button dialog-delete"
              type="button"
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </button>
          )}
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            Save feature
          </button>
        </div>
      </form>
    </div>
  );
}
