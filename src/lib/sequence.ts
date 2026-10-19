export type Topology = "Linear" | "Circular";

export type Location =
  | { Range: [[number, { Before: boolean }], [number, { After: boolean }]] }
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

export function sequenceText(record: SequenceRecord): string {
  return new TextDecoder().decode(new Uint8Array(record.seq));
}

export function featureLocationText(location: Location): string {
  if ("Range" in location) {
    const [[start, { Before: before }], [end, { After: after }]] =
      location.Range;
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
