mod formats;
mod operations;

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
    #[error("{0}")]
    Operation(String),
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

#[tauri::command]
fn new_record(name: String) -> Result<Seq, AppError> {
    operations::new_record(name).map_err(AppError::Operation)
}

#[tauri::command]
fn replace_sequence(
    record: Seq,
    start: usize,
    end: usize,
    replacement: String,
) -> Result<Seq, AppError> {
    operations::replace_sequence(record, start, end, &replacement).map_err(AppError::Operation)
}

#[tauri::command]
fn reverse_complement(record: Seq) -> Result<Seq, AppError> {
    operations::reverse_complement(record).map_err(AppError::Operation)
}

#[tauri::command]
fn add_feature(record: Seq, feature: gb_io::seq::Feature) -> Result<Seq, AppError> {
    operations::add_feature(record, feature).map_err(AppError::Operation)
}

#[tauri::command]
fn update_feature(
    record: Seq,
    index: usize,
    feature: gb_io::seq::Feature,
) -> Result<Seq, AppError> {
    operations::update_feature(record, index, feature).map_err(AppError::Operation)
}

#[tauri::command]
fn delete_feature(record: Seq, index: usize) -> Result<Seq, AppError> {
    operations::delete_feature(record, index).map_err(AppError::Operation)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            parse_genbank,
            write_genbank,
            parse_fasta,
            write_fasta,
            new_record,
            replace_sequence,
            reverse_complement,
            add_feature,
            update_feature,
            delete_feature
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Molecular Cloning Studio");
}

#[cfg(test)]
mod tests {
    use super::formats::{fasta, genbank};
    use super::operations;
    use gb_io::{
        reader::SeqReader,
        seq::{After, Before, Feature, Location},
    };
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

    #[test]
    fn sequence_substitution_preserves_feature_coordinates() {
        let mut record = genbank::parse_single(CIRCULAR_FIXTURE).expect("fixture should parse");
        let original_features = record.features.clone();
        record = operations::replace_sequence(record, 0, 1, "G").expect("substitution works");
        assert_eq!(record.seq[0], b'G');
        assert_eq!(record.features, original_features);
    }

    #[test]
    fn linear_insertion_shifts_features_after_the_edit() {
        let mut record = operations::new_record("example".to_owned()).expect("record creates");
        record.topology = gb_io::seq::Topology::Linear;
        record.features.push(Feature {
            kind: "gene".into(),
            location: Location::simple_range(2, 4),
            qualifiers: vec![],
        });

        let edited = operations::replace_sequence(record, 1, 1, "AAA").expect("insert works");
        assert_eq!(edited.seq.len(), 7);
        assert_eq!(edited.features[0].location.to_gb_format(), "6..7");
    }

    #[test]
    fn circular_indels_are_rejected_without_changing_the_record() {
        let record = genbank::parse_single(CIRCULAR_FIXTURE).expect("fixture should parse");
        let error = operations::replace_sequence(record, 0, 1, "AA")
            .expect_err("circular indel coordinates require a separate workflow");
        assert!(error.contains("equal-length"));
    }

    #[test]
    fn reverse_complement_transforms_sequence_and_annotated_locations() {
        let record = genbank::parse_single(CIRCULAR_FIXTURE).expect("fixture should parse");
        let reversed = operations::reverse_complement(record.clone()).expect("reverse complement");
        assert_eq!(reversed.seq, b"gcatgcatgcatgcatgcatgcatgcatgcatgcat");
        assert!(reversed.features.iter().any(|feature| {
            feature.kind == "CDS" && feature.location.to_gb_format() == "7..22"
        }));
        let restored = operations::reverse_complement(reversed).expect("reverse again");
        assert_eq!(restored, record);
    }

    #[test]
    fn feature_edits_validate_bounds_and_update_the_record() {
        let mut record = operations::new_record("example".to_owned()).expect("record creates");
        let feature = Feature {
            kind: "gene".into(),
            location: Location::Range((0, Before(false)), (2, After(false))),
            qualifiers: vec![],
        };
        record = operations::add_feature(record, feature.clone()).expect("feature adds");
        assert_eq!(record.features.len(), 1);

        let bad_feature = Feature {
            location: Location::simple_range(0, 10),
            ..feature.clone()
        };
        assert!(operations::update_feature(record.clone(), 0, bad_feature).is_err());
        let updated = operations::update_feature(record, 0, feature).expect("feature updates");
        assert_eq!(
            operations::delete_feature(updated, 0)
                .expect("feature deletes")
                .features
                .len(),
            0
        );
    }
}
