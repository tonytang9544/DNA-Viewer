export type Topology = "Linear" | "Circular";

export type Location =
  | { Range: [[number, boolean], [number, boolean]] }
  | { Between: [number, number] }
  | { Complement: Location }
  | { Join: Location[] }
  | { Order: Location[] }
  | { Bond: Location[] }
  | { OneOf: Location[] }
  | { External: [string, Location | null] }
  | { Gap: "Unknown" | "Unk100" | { Known: number } };

export interface Feature {
  kind: string;
  location: Location;
  qualifiers: [string, string | null][];
}

export interface SequenceRecord {
  name: string | null;
  topology: Topology;
  date: { year: number; month: number; day: number } | null;
  len: number | null;
  molecule_type: string | null;
  division: string;
  definition: string | null;
  accession: string | null;
  version: string | null;
  source: { source: string; organism: string | null } | null;
  dblink: string | null;
  keywords: string | null;
  references: {
    description: string;
    authors: string | null;
    consortium: string | null;
    title: string;
    journal: string | null;
    pubmed: string | null;
    remark: string | null;
  }[];
  comments: string[];
  seq: number[];
  contig: Location | null;
  features: Feature[];
}

export interface FeatureSegment {
  start: number;
  end: number;
  reverse: boolean;
}

export function sequenceText(record: SequenceRecord): string {
  return new TextDecoder().decode(new Uint8Array(record.seq));
}

export function featureSegments(
  location: Location,
  reverse = false,
): FeatureSegment[] {
  if ("Range" in location) {
    return [
      {
        start: location.Range[0][0],
        end: location.Range[1][0],
        reverse,
      },
    ];
  }
  if ("Complement" in location) {
    return featureSegments(location.Complement, !reverse);
  }
  if ("Join" in location) {
    return location.Join.flatMap((part) => featureSegments(part, reverse));
  }
  if ("Order" in location) {
    return location.Order.flatMap((part) => featureSegments(part, reverse));
  }
  if ("Bond" in location) {
    return location.Bond.flatMap((part) => featureSegments(part, reverse));
  }
  if ("OneOf" in location) {
    return location.OneOf.flatMap((part) => featureSegments(part, reverse));
  }
  if ("Between" in location) {
    return [
      { start: location.Between[0], end: location.Between[1] + 1, reverse },
    ];
  }
  if ("External" in location && location.External[1]) {
    return featureSegments(location.External[1], reverse);
  }
  return [];
}

export function simpleFeatureRange(location: Location): FeatureSegment | null {
  const reverse = "Complement" in location;
  const unwrapped = reverse ? location.Complement : location;
  if (!("Range" in unwrapped)) return null;
  const [[start], [end]] = unwrapped.Range;
  return { start, end, reverse };
}

export function featureLocationText(location: Location): string {
  if ("Range" in location) {
    const [[start, before], [end, after]] = location.Range;
    const first = `${before ? "<" : ""}${start + 1}`;
    const last = `${after ? ">" : ""}${end}`;
    return end - start === 1 && !before && !after ? first : `${first}..${last}`;
  }
  if ("Between" in location) {
    const [left, right] = location.Between;
    return `${left + 1}^${right + 1}`;
  }
  if ("Join" in location) {
    return `join(${location.Join.map(featureLocationText).join(",")})`;
  }
  if ("Order" in location) {
    return `order(${location.Order.map(featureLocationText).join(",")})`;
  }
  if ("Bond" in location) {
    return `bond(${location.Bond.map(featureLocationText).join(",")})`;
  }
  if ("OneOf" in location) {
    return `one-of(${location.OneOf.map(featureLocationText).join(",")})`;
  }
  if ("Complement" in location) {
    return `complement(${featureLocationText(location.Complement)})`;
  }
  if ("External" in location) {
    const [name, part] = location.External;
    return part ? `${name}:${featureLocationText(part)}` : name;
  }
  if (typeof location.Gap === "object") {
    return `gap(${JSON.stringify(location.Gap)})`;
  }
  return `gap(${location.Gap === "Unknown" ? "" : "unk100"})`;
}
