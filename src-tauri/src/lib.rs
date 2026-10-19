mod formats;

use gb_io::seq::Seq;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("GenBank error: {0}")]
    Genbank(#[from] gb_io::reader::GbParserError),
    #[error("FASTA error: {0}")]
    Fasta(String),
    #[error("File output error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Generated output was not valid UTF-8: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
fn parse_genbank(contents: String) -> Result<Seq, AppError> {
    formats::genbank::parse_single(&contents)
}

#[tauri::command]
fn write_genbank(record: Seq) -> Result<String, AppError> {
    formats::genbank::write(&record)
}

#[tauri::command]
fn parse_fasta(contents: String) -> Result<Seq, AppError> {
    formats::fasta::parse_single(&contents)
}

#[tauri::command]
fn write_fasta(record: Seq) -> Result<String, AppError> {
    formats::fasta::write(&record)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            parse_genbank,
            write_genbank,
            parse_fasta,
            write_fasta
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Molecular Cloning Studio");
}

#[cfg(test)]
mod tests {
    use super::formats::{fasta, genbank};
    use gb_io::reader::SeqReader;
    use std::io::Cursor;

    const CIRCULAR_FIXTURE: &str = include_str!("../../examples/annotated-circular.gb");

    #[test]
    fn annotated_circular_genbank_round_trips() {
        let original = genbank::parse_single(CIRCULAR_FIXTURE).expect("fixture should parse");
        assert_eq!(original.topology, gb_io::seq::Topology::Circular);
        assert_eq!(original.seq.len(), 36);
        assert_eq!(original.features.len(), 4);
        assert!(original
            .features
            .iter()
            .any(|feature| { feature.location.to_gb_format() == "join(31..36,1..6)" }));

        let exported = genbank::write(&original).expect("record should serialize");
        let reparsed: Vec<_> = SeqReader::new(Cursor::new(exported.as_bytes()))
            .collect::<Result<_, _>>()
            .expect("export should parse");
        assert_eq!(reparsed, [original]);

        let command_payload =
            serde_json::to_string(&reparsed[0]).expect("record should serialize for Tauri");
        let command_record: gb_io::seq::Seq =
            serde_json::from_str(&command_payload).expect("record should deserialize from Tauri");
        assert_eq!(command_record, reparsed[0]);
    }

    #[test]
    fn genbank_rejects_multiple_records() {
        let two_records = format!("{CIRCULAR_FIXTURE}{CIRCULAR_FIXTURE}");
        let error =
            genbank::parse_single(&two_records).expect_err("multiple records are unsupported");
        assert!(
            error.to_string().contains("Only one GenBank record"),
            "unexpected validation error: {error}"
        );
    }

    #[test]
    fn genbank_rejects_malformed_input() {
        let error = genbank::parse_single("not a GenBank record")
            .expect_err("malformed GenBank should not be accepted");
        assert!(error.to_string().contains("GenBank error"));
    }

    #[test]
    fn fasta_round_trips_a_single_record() {
        let record =
            fasta::parse_single(">sample construct\nACGTACGT\n").expect("FASTA should parse");
        assert_eq!(record.name.as_deref(), Some("sample construct"));
        assert_eq!(
            fasta::write(&record).expect("record should serialize"),
            ">sample construct\nACGTACGT\n"
        );
    }

    #[test]
    fn fasta_rejects_invalid_bases() {
        let error = fasta::parse_single(">sample\nACGT123\n")
            .expect_err("numeric characters are not sequence symbols");
        assert!(error.to_string().contains("invalid character"));
    }
}
