import type { TokenSignal } from '../types';
import TokenSignalCard from './TokenSignalCard';

type TokenSignalsTableProps = {
  tokens: TokenSignal[];
};

const TokenSignalsTable = ({ tokens }: TokenSignalsTableProps) => (
  <section
    style={{
      display: 'grid',
      gap: 10,
      width: '100%',
    }}
  >
    {tokens.length ? (
      tokens.map((token) => (
        <TokenSignalCard
          key={`${token.rank}-${token.address}-${token.symbol}`}
          token={token}
        />
      ))
    ) : (
      <div
        style={{
          border: '1px solid #292633',
          borderRadius: 8,
          color: '#8f8a9d',
          fontSize: 13,
          fontWeight: 800,
          padding: '42px 16px',
          textAlign: 'center',
        }}
      >
        Waiting for researched token opportunities.
      </div>
    )}
  </section>
);

export default TokenSignalsTable;
