import { formatScore } from '../utils/format';

type ScoreBarProps = {
  color: string;
  label: string;
  score?: number;
};

const ScoreBar = ({ color, label, score }: ScoreBarProps) => {
  const normalizedScore =
    score === undefined ? 0 : Math.max(0, Math.min(10, score));

  return (
    <div style={{ minWidth: 78 }}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 5,
        }}
      >
        <span style={{ color: '#918b9f', fontSize: 10, fontWeight: 800 }}>
          {label}
        </span>
        <span style={{ color, fontSize: 11, fontWeight: 900 }}>
          {formatScore(score)}
        </span>
      </div>
      <div
        style={{
          background: '#25222d',
          borderRadius: 999,
          height: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: color,
            borderRadius: 999,
            height: '100%',
            width: `${normalizedScore * 10}%`,
          }}
        />
      </div>
    </div>
  );
};

export default ScoreBar;

