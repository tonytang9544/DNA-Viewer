use crate::AppError;
use gb_io::{reader::SeqReader, seq::Seq, writer::SeqWriter};

pub fn parse_single(contents: &str) -> Result<Seq, AppError> {
    let mut records = SeqReader::new(contents.as_bytes());
    let record = records.next().ok_or_else(|| {
        AppError::Genbank(gb_io::reader::GbParserError::SyntaxError(
            "The file contains no GenBank records.".to_owned(),
        ))
    })??;

    match records.next() {
        Some(Ok(_)) => {
            return Err(AppError::Genbank(
                gb_io::reader::GbParserError::SyntaxError(
                    "Only one GenBank record is supported in this initial workspace.".to_owned(),
                ),
            ));
        }
        Some(Err(error)) => return Err(AppError::Genbank(error)),
        None => {}
    }

    Ok(record)
}

pub fn write(record: &Seq) -> Result<String, AppError> {
    let mut output = Vec::new();
    SeqWriter::new(&mut output).write(record)?;
    String::from_utf8(output).map_err(AppError::from)
}
