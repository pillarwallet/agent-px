import { polygon } from 'viem/chains';
import { getNativeAssetForChainId } from '../blockchain';

describe('getNativeAssetForChainId', () => {
  it('returns {POL} for polygon', () => {
    const asset = getNativeAssetForChainId(polygon.id);
    expect(asset.name).toBe('POL');
    expect(asset.symbol).toBe('POL');
  });
});
