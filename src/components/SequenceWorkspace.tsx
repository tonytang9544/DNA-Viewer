import { useMemo } from "react";
import SeqViz, { type SeqVizProps } from "seqviz";
import type { SequenceRecord } from "../lib/sequence";
import {
  complementarySequence,
  isRnaRecord,
  sequenceAnnotations,
} from "../lib/seqviz";

interface SequenceWorkspaceProps {
  record: SequenceRecord;
  selectedRange: [number, number] | null;
  searchQuery: string;
  onSelectionChange: (
    range: [number, number],
    featureIndex: number | null,
  ) => void;
}

type SeqVizSelection = Parameters<NonNullable<SeqVizProps["onSelection"]>>[0];

function selectedFeatureIndex(
  selection: SeqVizSelection,
  annotations: ReturnType<typeof sequenceAnnotations>,
): number | null {
  if (selection.type !== "ANNOTATION") return null;
  const start = Math.min(selection.start ?? 0, selection.end ?? 0);
  const end = Math.max(selection.start ?? 0, selection.end ?? 0);
  const match = annotations.find(
    ({ annotation }) =>
      annotation.name === selection.name &&
      annotation.start === start &&
      annotation.end === end,
  );
  return match?.featureIndex ?? null;
}

export default function SequenceWorkspace({
  record,
  selectedRange,
  searchQuery,
  onSelectionChange,
}: SequenceWorkspaceProps) {
  const sequence = useMemo(
    () => new TextDecoder().decode(new Uint8Array(record.seq)),
    [record.seq],
  );
  const isRna = isRnaRecord(record);
  const complement = useMemo(
    () => complementarySequence(sequence, isRna),
    [sequence, isRna],
  );
  const mappedAnnotations = useMemo(
    () => sequenceAnnotations(record),
    [record],
  );
  const annotations = useMemo(
    () => mappedAnnotations.map(({ annotation }) => annotation),
    [mappedAnnotations],
  );

  function handleSelection(selection: SeqVizSelection) {
    if (selection.start === undefined || selection.end === undefined) return;
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);
    const range: [number, number] =
      selection.type === "ANNOTATION"
        ? [start, end]
        : [start, Math.min(end + 1, sequence.length)];
    onSelectionChange(
      range,
      selectedFeatureIndex(selection, mappedAnnotations),
    );
  }

  return (
    <div className="sequence-workspace">
      {sequence ? (
        <SeqViz
          annotations={annotations}
          compSeq={complement.sequence}
          disableExternalFonts
          name={record.name ?? ""}
          onSelection={handleSelection}
          primers={[]}
          search={searchQuery ? { query: searchQuery } : undefined}
          selection={
            selectedRange && selectedRange[1] > selectedRange[0]
              ? {
                  start: selectedRange[0],
                  end: selectedRange[1] - 1,
                }
              : undefined
          }
          seq={sequence}
          seqType={isRna ? "rna" : "dna"}
          showComplement
          showIndex
          style={{ height: "100%", width: "100%" }}
          viewer="linear"
        />
      ) : (
        <div className="empty-sequence">This record has no sequence bases.</div>
      )}
      {complement.unsupportedSymbols.length > 0 && (
        <p className="viewer-warning" role="status">
          Unsupported base symbols {complement.unsupportedSymbols.join(", ")}{" "}
          are shown as N on the complementary strand.
        </p>
      )}
    </div>
  );
}
