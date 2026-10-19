import {
  type Feature,
  featureSegments,
  type SequenceRecord,
} from "../lib/sequence";

interface SequenceMapProps {
  record: SequenceRecord;
  selectedFeature: number | null;
  onSelectFeature: (index: number) => void;
}

const COLORS = ["#428b70", "#6686bf", "#d49a50", "#ac6f85", "#7e8d63"];

function polarPoint(angle: number, radius: number): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [150 + radius * Math.cos(radians), 150 + radius * Math.sin(radians)];
}

function segmentPath(
  start: number,
  end: number,
  length: number,
  radius: number,
): string {
  const startAngle = (start / length) * 360;
  const endAngle = (end / length) * 360;
  const [x1, y1] = polarPoint(startAngle, radius);
  const [x2, y2] = polarPoint(endAngle, radius);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function featureLabel(feature: Feature): string {
  return (
    feature.qualifiers.find(([key]) =>
      ["label", "gene", "product"].includes(key),
    )?.[1] ?? feature.kind
  );
}

function featureEntries(features: Feature[]) {
  const occurrences = new Map<string, number>();
  return features.map((feature, index) => {
    const identity = JSON.stringify(feature);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return {
      feature,
      index,
      key: `${identity}-${occurrence}`,
    };
  });
}

export default function SequenceMap({
  record,
  selectedFeature,
  onSelectFeature,
}: SequenceMapProps) {
  const length = record.seq.length;
  const circular = record.topology === "Circular";

  if (length === 0) {
    return <p className="map-empty">Add sequence bases to see the map.</p>;
  }
  if (!circular) {
    return (
      <fieldset className="linear-overview">
        <legend className="visually-hidden">Linear feature overview</legend>
        <div className="linear-track" />
        {featureEntries(record.features).map(({ feature, index, key }) =>
          featureSegments(feature.location).map((segment) => (
            <button
              className={`linear-feature${selectedFeature === index ? " is-selected" : ""}`}
              key={`${key}-${segment.start}-${segment.end}`}
              style={{
                left: `${(segment.start / length) * 100}%`,
                width: `${Math.max(((segment.end - segment.start) / length) * 100, 0.8)}%`,
                background: COLORS[index % COLORS.length],
              }}
              type="button"
              title={`${featureLabel(feature)} · ${segment.start + 1}..${segment.end}`}
              aria-label={`Select feature ${featureLabel(feature)}`}
              onClick={() => onSelectFeature(index)}
            />
          )),
        )}
        <div className="linear-endpoints">
          <span>1</span>
          <span>{length.toLocaleString()}</span>
        </div>
      </fieldset>
    );
  }

  return (
    <div className="circular-map-wrap">
      <svg className="circular-map" viewBox="0 0 300 300" aria-hidden="true">
        <circle
          cx="150"
          cy="150"
          r="112"
          fill="none"
          stroke="#edf1ee"
          strokeWidth="14"
        />
        {featureEntries(record.features).flatMap(({ feature, index, key }) =>
          featureSegments(feature.location).map((segment) => {
            const selected = selectedFeature === index;
            return (
              <path
                d={segmentPath(segment.start, segment.end, length, 112)}
                key={`${key}-${segment.start}-${segment.end}`}
                fill="none"
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={selected ? 20 : 14}
                strokeLinecap="butt"
                className="map-feature-arc"
              />
            );
          }),
        )}
        <circle cx="150" cy="150" r="87" fill="#fff" />
        <text x="150" y="143" textAnchor="middle" className="map-length">
          {length.toLocaleString()}
        </text>
        <text x="150" y="163" textAnchor="middle" className="map-unit">
          base pairs
        </text>
      </svg>
      <div className="map-legend">
        {featureEntries(record.features).map(({ feature, index, key }) => (
          <button
            type="button"
            className={`legend-item${selectedFeature === index ? " is-selected" : ""}`}
            key={key}
            onClick={() => onSelectFeature(index)}
          >
            <span style={{ background: COLORS[index % COLORS.length] }} />
            <strong>{featureLabel(feature)}</strong>
            <small className="legend-item-kind">{feature.kind}</small>
          </button>
        ))}
        {record.features.length === 0 && (
          <span className="map-empty">No annotated features yet.</span>
        )}
      </div>
    </div>
  );
}
