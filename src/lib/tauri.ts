import { invoke } from "@tauri-apps/api/core";
import type { SequenceRecord } from "./sequence";

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
