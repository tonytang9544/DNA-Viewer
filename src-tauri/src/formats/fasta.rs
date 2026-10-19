use crate::AppError;
use gb_io::seq::Seq;

pub fn parse_single(contents: &str) -> Result<Seq, AppError> {
    let mut name = None;
    let mut sequence = Vec::new();

    for line in contents.lines().map(str::trim) {
        if line.is_empty() {
            continue;
        }
        if let Some(header) = line.strip_prefix('>') {
            if name.is_some() {
                return Err(AppError::Fasta(
                    "Only one FASTA record is supported in this initial workspace.".to_owned(),
                ));
            }
            let header = header.trim();
            if header.is_empty() {
                return Err(AppError::Fasta("The FASTA header is empty.".to_owned()));
            }
            name = Some(header.to_owned());
            continue;
        }

        if name.is_none() {
            return Err(AppError::Fasta(
                "Sequence data must follow a FASTA header beginning with '>'.".to_owned(),
            ));
        }
        for base in line.bytes() {
            if !base.is_ascii_alphabetic() && !b"*-.".contains(&base) {
                return Err(AppError::Fasta(format!(
                    "The sequence contains an invalid character: '{}'.",
                    char::from(base)
                )));
            }
            sequence.push(base.to_ascii_uppercase());
        }
    }

    let name =
        name.ok_or_else(|| AppError::Fasta("The file contains no FASTA record.".to_owned()))?;
    let mut record = Seq::empty();
    record.name = Some(name);
    record.len = Some(sequence.len());
    record.seq = sequence;
    record.molecule_type = Some("DNA".to_owned());
    Ok(record)
}

pub fn write(record: &Seq) -> Result<String, AppError> {
    let name = record
        .name
        .as_deref()
        .or(record.accession.as_deref())
        .unwrap_or("Untitled sequence");
    let sequence = std::str::from_utf8(&record.seq)
        .map_err(|error| AppError::Fasta(format!("Sequence is not ASCII text: {error}")))?;
    let mut output = format!(">{name}\n");
    for line in sequence.as_bytes().chunks(70) {
        output
            .push_str(std::str::from_utf8(line).map_err(|error| {
                AppError::Fasta(format!("Sequence is not ASCII text: {error}"))
            })?);
        output.push('\n');
    }
    Ok(output)
}
