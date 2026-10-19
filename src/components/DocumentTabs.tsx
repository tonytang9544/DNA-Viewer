export interface OpenDocumentTab {
  id: string;
  name: string;
  dirty: boolean;
}

interface DocumentTabsProps {
  documents: OpenDocumentTab[];
  activeId: string | null;
  disabled: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export default function DocumentTabs({
  documents,
  activeId,
  disabled,
  onActivate,
  onClose,
}: DocumentTabsProps) {
  return (
    <nav className="document-nav" aria-label="Open documents">
      {documents.length > 0 ? (
        <div className="document-tabs">
          {documents.map((document) => (
            <div
              className={`open-document-tab${activeId === document.id ? " is-active" : ""}`}
              key={document.id}
            >
              <button
                className="document-tab-select"
                type="button"
                id={`tab-${document.id}`}
                aria-label={`${document.name || "Untitled sequence"}${document.dirty ? ", unsaved changes" : ""}`}
                aria-current={activeId === document.id ? "page" : undefined}
                aria-controls={`document-panel-${document.id}`}
                onClick={() => onActivate(document.id)}
                disabled={disabled}
              >
                <span>{document.name || "Untitled sequence"}</span>
                {document.dirty && (
                  <span className="dirty-indicator" aria-hidden="true">
                    •
                  </span>
                )}
              </button>
              <button
                className="document-tab-close"
                type="button"
                aria-label={`Close ${document.name || "sequence"}`}
                onClick={() => onClose(document.id)}
                disabled={disabled}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="no-documents-label">No open documents</span>
      )}
    </nav>
  );
}
