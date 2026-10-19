import { invoke } from "@tauri-apps/api/core";
import type { Feature, SequenceRecord } from "./sequence";

export function parseGenbank(contents: string): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("parse_genbank", { contents });
}

export function writeGenbank(record: SequenceRecord): Promise<string> {
  return invoke<string>("write_genbank", { record });
}

export function parseFasta(contents: string): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("parse_fasta", { contents });
}

export function writeFasta(record: SequenceRecord): Promise<string> {
  return invoke<string>("write_fasta", { record });
}

export function saveTextFile(path: string, contents: string): Promise<void> {
  return invoke<void>("save_text_file", { path, contents });
}

export function newRecord(name: string): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("new_record", { name });
}

export function replaceSequence(
  record: SequenceRecord,
  start: number,
  end: number,
  replacement: string,
): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("replace_sequence", {
    record,
    start,
    end,
    replacement,
  });
}

export function reverseComplement(
  record: SequenceRecord,
): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("reverse_complement", { record });
}

export function addFeature(
  record: SequenceRecord,
  feature: Feature,
): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("add_feature", { record, feature });
}

export function updateFeature(
  record: SequenceRecord,
  index: number,
  feature: Feature,
): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("update_feature", { record, index, feature });
}

export function deleteFeature(
  record: SequenceRecord,
  index: number,
): Promise<SequenceRecord> {
  return invoke<SequenceRecord>("delete_feature", { record, index });
}
