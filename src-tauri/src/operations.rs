use gb_io::seq::{Feature, GapLength, Location, Seq, Topology};

#[derive(Clone, Copy)]
struct SequenceEdit {
    start: i64,
    end: i64,
    inserted_len: i64,
}

#[derive(Clone, Copy)]
enum BoundaryBias {
    Left,
    Right,
}

impl SequenceEdit {
    fn map_boundary(self, position: i64, bias: BoundaryBias) -> i64 {
        let removed_len = self.end - self.start;
        let delta = self.inserted_len - removed_len;

        if position < self.start {
            return position;
        }
        if position > self.end {
            return position + delta;
        }
        if self.start == self.end {
            return match bias {
                BoundaryBias::Left => position,
                BoundaryBias::Right => position + self.inserted_len,
            };
        }
        if position == self.start {
            return self.start;
        }
        if position == self.end {
            return self.start + self.inserted_len;
        }
        match bias {
            BoundaryBias::Left => self.start,
            BoundaryBias::Right => self.start + self.inserted_len,
        }
    }

    fn map_location(self, location: Location) -> Option<Location> {
        match location {
            Location::Range((start, before), (end, after)) => {
                let start = self.map_boundary(start, BoundaryBias::Right);
                let end = self.map_boundary(end, BoundaryBias::Left);
                (start < end).then_some(Location::Range((start, before), (end, after)))
            }
            Location::Between(left, right) => Some(Location::Between(
                self.map_boundary(left, BoundaryBias::Left),
                self.map_boundary(right, BoundaryBias::Right),
            )),
            Location::Complement(inner) => self
                .map_location(*inner)
                .map(|mapped| Location::Complement(Box::new(mapped))),
            Location::Join(parts) => map_parts(parts, self).map(Location::Join),
            Location::Order(parts) => map_parts(parts, self).map(Location::Order),
            Location::Bond(parts) => map_parts(parts, self).map(Location::Bond),
            Location::OneOf(parts) => map_parts(parts, self).map(Location::OneOf),
            Location::External(name, inner) => Some(Location::External(name, inner)),
            Location::Gap(length) => Some(Location::Gap(length)),
        }
    }
}

fn map_parts(parts: Vec<Location>, edit: SequenceEdit) -> Option<Vec<Location>> {
    let mapped: Vec<_> = parts
        .into_iter()
        .filter_map(|part| edit.map_location(part))
        .collect();
    (!mapped.is_empty()).then_some(mapped)
}

pub fn new_record(name: String) -> Result<Seq, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("A sequence record needs a name.".to_owned());
    }
    let mut record = Seq::empty();
    record.name = Some(name.to_owned());
    record.seq = b"ATGC".to_vec();
    record.len = Some(record.seq.len());
    record.molecule_type = Some("DNA".to_owned());
    Ok(record)
}

pub fn replace_sequence(
    mut record: Seq,
    start: usize,
    end: usize,
    replacement: &str,
) -> Result<Seq, String> {
    if record.seq.is_empty() {
        return Err("Cannot edit a record without sequence data.".to_owned());
    }
    if start > end || end > record.seq.len() {
        return Err("The selected sequence range is outside the record.".to_owned());
    }
    if !replacement
        .bytes()
        .all(|base| base.is_ascii_alphabetic() || b"*-.".contains(&base))
    {
        return Err(
            "Sequence edits may contain only ASCII bases or the symbols '*', '-' and '.'."
                .to_owned(),
        );
    }
    if record.topology == Topology::Circular && replacement.len() != end - start {
        return Err(
            "Insertions and deletions in circular records are not supported yet; replace an equal-length selection."
                .to_owned(),
        );
    }

    let start = i64::try_from(start).map_err(|_| "The selected range is too large.".to_owned())?;
    let end = i64::try_from(end).map_err(|_| "The selected range is too large.".to_owned())?;
    let inserted_len = i64::try_from(replacement.len())
        .map_err(|_| "The replacement sequence is too large.".to_owned())?;
    let edit = SequenceEdit {
        start,
        end,
        inserted_len,
    };

    record.seq.splice(
        usize::try_from(start).map_err(|_| "The selected range is invalid.".to_owned())?
            ..usize::try_from(end).map_err(|_| "The selected range is invalid.".to_owned())?,
        replacement.bytes().map(|base| base.to_ascii_uppercase()),
    );
    record.len = Some(record.seq.len());
    record.features = record
        .features
        .into_iter()
        .filter_map(|mut feature| {
            feature.location = edit.map_location(feature.location)?;
            Some(feature)
        })
        .collect();
    if let Some(contig) = record.contig.take() {
        record.contig = edit.map_location(contig);
    }
    Ok(record)
}

pub fn reverse_complement(record: Seq) -> Result<Seq, String> {
    for feature in &record.features {
        record.revcomp_feature(feature.clone()).map_err(|error| {
            format!("Cannot reverse-complement an unsupported feature: {error}")
        })?;
    }
    Ok(record.revcomp())
}

pub fn add_feature(mut record: Seq, feature: Feature) -> Result<Seq, String> {
    validate_feature(&feature, record.seq.len())?;
    record.features.push(feature);
    Ok(record)
}

pub fn update_feature(mut record: Seq, index: usize, feature: Feature) -> Result<Seq, String> {
    validate_feature(&feature, record.seq.len())?;
    let slot = record
        .features
        .get_mut(index)
        .ok_or_else(|| "The feature no longer exists.".to_owned())?;
    *slot = feature;
    Ok(record)
}

pub fn delete_feature(mut record: Seq, index: usize) -> Result<Seq, String> {
    if index >= record.features.len() {
        return Err("The feature no longer exists.".to_owned());
    }
    record.features.remove(index);
    Ok(record)
}

fn validate_feature(feature: &Feature, sequence_len: usize) -> Result<(), String> {
    if feature.kind.trim().is_empty() {
        return Err("A feature needs a type.".to_owned());
    }
    validate_location(&feature.location, sequence_len)
}

fn validate_location(location: &Location, sequence_len: usize) -> Result<(), String> {
    let sequence_len =
        i64::try_from(sequence_len).map_err(|_| "The sequence is too large.".to_owned())?;
    match location {
        Location::Range((start, _), (end, _)) => {
            if *start < 0 || end <= start || *end > sequence_len {
                return Err("Feature ranges must be non-empty and within the sequence.".to_owned());
            }
        }
        Location::Between(left, right) => {
            if *left < 0 || *right < 0 || *left > sequence_len || *right > sequence_len {
                return Err("Feature boundaries must be within the sequence.".to_owned());
            }
        }
        Location::Complement(inner) => validate_location(inner, sequence_len as usize)?,
        Location::Join(parts)
        | Location::Order(parts)
        | Location::Bond(parts)
        | Location::OneOf(parts) => {
            if parts.is_empty() {
                return Err("Compound features must contain at least one location.".to_owned());
            }
            for part in parts {
                validate_location(part, sequence_len as usize)?;
            }
        }
        Location::External(_, Some(inner)) => validate_location(inner, sequence_len as usize)?,
        Location::External(_, None)
        | Location::Gap(GapLength::Known(_))
        | Location::Gap(GapLength::Unknown)
        | Location::Gap(GapLength::Unk100) => {}
    }
    Ok(())
}
