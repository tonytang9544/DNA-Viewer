interface SequenceEditorDialogProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

export default function SequenceEditorDialog({
  value,
  busy,
  onChange,
  onApply,
  onCancel,
}: SequenceEditorDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="editor-dialog sequence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sequence-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">EDITING</span>
            <h2 id="sequence-dialog-title">Sequence bases</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            onClick={onCancel}
            aria-label="Close sequence editor"
          >
            ×
          </button>
        </div>
        <p>
          Changes are validated and applied to the record when you continue.
        </p>
        <textarea
          className="sequence-edit-input"
          aria-label="Sequence bases"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onApply}
            disabled={busy}
          >
            Apply sequence edit
          </button>
        </div>
      </section>
    </div>
  );
}
