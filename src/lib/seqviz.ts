import type { SeqVizProps } from "seqviz";
import { type Feature, featureSegments, type SequenceRecord } from "./sequence";

export type SeqVizAnnotation = NonNullable<SeqVizProps["annotations"]>[number];

export interface FeatureAnnotation {
  featureIndex: number;
  annotation: SeqVizAnnotation;
}

export function featureLabel(feature: Feature): string {
  return (
    feature.qualifiers.find(([key]) =>
      ["label", "gene", "product"].includes(key),
    )?.[1] ?? feature.kind
  );
}

export function sequenceAnnotations(
  record: SequenceRecord,
): FeatureAnnotation[] {
  return record.features.flatMap((feature, featureIndex) => {
    const name = featureLabel(feature);
    return featureSegments(feature.location)
      .filter(
        ({ start, end }) =>
          Number.isInteger(start) &&
          Number.isInteger(end) &&
          start >= 0 &&
          end > start &&
          end <= record.seq.length,
      )
      .map(({ start, end, reverse }) => ({
        featureIndex,
        annotation: {
          name,
          start,
          end,
          direction: reverse ? -1 : 1,
        },
      }));
  });
}

export function complementarySequence(
  sequence: string,
  isRna: boolean,
): { sequence: string; unsupportedSymbols: string[] } {
  const dnaPairs: Record<string, string> = {
    A: "T",
    C: "G",
    G: "C",
    T: "A",
    U: "A",
    R: "Y",
    Y: "R",
    S: "S",
    W: "W",
    K: "M",
    M: "K",
    B: "V",
    V: "B",
    D: "H",
    H: "D",
    N: "N",
    X: "X",
    "-": "-",
    ".": ".",
  };
  const rnaPairs: Record<string, string> = { ...dnaPairs, A: "U", U: "A" };
  const pairs = isRna ? rnaPairs : dnaPairs;
  const unsupported = new Set<string>();
  const complemented = Array.from(sequence, (base) => {
    const upper = base.toUpperCase();
    const complement = pairs[upper];
    if (complement) {
      return base === upper ? complement : complement.toLowerCase();
    }
    unsupported.add(base);
    return base === upper ? "N" : "n";
  });
  return {
    sequence: complemented.join(""),
    unsupportedSymbols: [...unsupported].sort(),
  };
}

export function isRnaRecord(record: SequenceRecord): boolean {
  return record.molecule_type?.toUpperCase().includes("RNA") ?? false;
}
