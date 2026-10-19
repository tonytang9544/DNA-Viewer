import { type ChangeEvent, useMemo, useRef, useState } from "react";
import {
  featureLocationText,
  type SequenceRecord,
  sequenceText,
} from "./lib/sequence";
import {
  parseFasta,
  parseGenbank,
  writeFasta,
  writeGenbank,
} from "./lib/tauri";

type FileFormat = "genbank" | "fasta";

function formatSequenceLines(sequence: string): string {
  const lines: string[] = [];
  for (let start = 0; start < sequence.length; start += 60) {
    lines.push(
      `${String(start + 1).padStart(6, " ")} ${sequence.slice(start, start + 60)}`,
    );
  }
  return lines.join("\n");
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [record, setRecord] = useState<SequenceRecord | null>(null);
  const [format, setFormat] = useState<FileFormat>("genbank");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setRecord(parsed);
      setFormat(isFasta ? "fasta" : "genbank");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveFile() {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      const contents =
        format === "genbank"
          ? await writeGenbank(record)
          : await writeFasta(record);
      const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${record.name || "sequence"}.${format === "genbank" ? "gb" : "fasta"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const bases = useMemo(() => (record ? sequenceText(record) : ""), [record]);
  const formattedSequence = useMemo(() => formatSequenceLines(bases), [bases]);

  return (
    <main className="app-shell">
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
            Open sequence
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={saveFile}
            disabled={!record || busy}
          >
            Export {format === "genbank" ? "GenBank" : "FASTA"}
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Sequence workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">WORKSPACE</span>
            <span className="sidebar-count">{record ? "1" : "0"}</span>
          </div>
          {record ? (
            <button type="button" className="record-item" aria-current="page">
              <span className="record-icon" aria-hidden="true">
                DNA
              </span>
              <span className="record-label">
                <strong>{record.name || "Untitled sequence"}</strong>
                <small>
                  {record.topology.toLowerCase()} · {record.seq.length} bp
                </small>
              </span>
            </button>
          ) : (
            <p className="sidebar-empty">Open a sequence to begin.</p>
          )}
          <div className="sidebar-footer">
            <span className="status-dot" />
            All data stays on this device
          </div>
        </aside>

        <section className="document" aria-label="Sequence document">
          {error && (
            <div className="error-banner" role="alert">
              <strong>Could not process this file.</strong>
              <span>{error}</span>
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
                Open a GenBank or FASTA file to explore its sequence and
                annotations.
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                Open a file
              </button>
              <span className="format-note">
                GenBank is recommended for annotated records.
              </span>
            </div>
          ) : (
            <>
              <div className="document-header">
                <div>
                  <span className="eyebrow">SEQUENCE RECORD</span>
                  <h1>{record.name || "Untitled sequence"}</h1>
                  {record.definition && <p>{record.definition}</p>}
                </div>
                <span className="topology-chip">
                  {record.topology.toLowerCase()}
                </span>
              </div>
              <section className="stats-row" aria-label="Sequence statistics">
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
                  <span>Molecule</span>
                  <strong>{record.molecule_type || "DNA"}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>{format === "genbank" ? "GenBank" : "FASTA"}</strong>
                </div>
              </section>
              {record.features.length > 0 && (
                <section
                  className="feature-section"
                  aria-labelledby="feature-heading"
                >
                  <div className="section-heading">
                    <h2 id="feature-heading">Annotations</h2>
                    <span>{record.features.length} features</span>
                  </div>
                  <div className="feature-list">
                    {record.features.slice(0, 8).map((feature) => {
                      const label = feature.qualifiers.find(([key]) =>
                        ["label", "gene", "product"].includes(key),
                      )?.[1];
                      const key = JSON.stringify([
                        feature.kind,
                        feature.location,
                        feature.qualifiers,
                      ]);
                      return (
                        <div className="feature-row" key={key}>
                          <span
                            className={`feature-marker feature-${feature.kind.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`}
                          />
                          <strong>{label || feature.kind}</strong>
                          <span>{feature.kind}</span>
                          <code>{featureLocationText(feature.location)}</code>
                        </div>
                      );
                    })}
                    {record.features.length > 8 && (
                      <p className="more-features">
                        Showing 8 of {record.features.length} annotations.
                      </p>
                    )}
                  </div>
                </section>
              )}
              <section
                className="sequence-section"
                aria-labelledby="sequence-heading"
              >
                <div className="section-heading">
                  <h2 id="sequence-heading">Sequence</h2>
                  <span>5′ → 3′</span>
                </div>
                <pre className="sequence-view">{formattedSequence}</pre>
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
