import React from 'react';
import { chainNameToChainIdTokensData } from '../../../../services/tokensData';
import { getLogoForChainId } from '../../../../utils/blockchain';
import RandomAvatar from '../../../pillarx-app/components/RandomAvatar/RandomAvatar';
import { formatBigNumber } from '../../utils/number';
import { Market } from '../../utils/parseSearchData';
import TokenPriceChange from '../Price/TokenPriceChange';

export interface MarketListProps {
  markets: Market[];
  handleMarketSelect: (market: Market) => void;
}

export default function MarketList({
  markets,
  handleMarketSelect,
}: MarketListProps) {
  if (!markets || markets.length === 0) {
    return null;
  }

  return (
    <>
      {markets.map((market) => {
        const chainId = chainNameToChainIdTokensData(market.blockchain);

        return (
          <button
            key={`${market.address}-${market.blockchain}`}
            className="flex w-full h-9 my-2.5"
            onClick={() => {
              handleMarketSelect(market);
            }}
            type="button"
            data-testid={`pulse-market-${market.blockchain.toLowerCase()}-${market.pairName.toLowerCase()}`}
          >
            <div className="relative inline-block">
              {/* Token0 Logo */}
              {market.token0.logo ? (
                <img
                  src={market.token0.logo || ''}
                  className="w-9 h-9 ml-2.5 rounded-full"
                  alt="token0 logo"
                />
              ) : (
                <div className="w-9 h-9 ml-2.5 overflow-hidden rounded-full">
                  <RandomAvatar name={market.token0.name || ''} />
                  <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold ml-2.5">
                    {market.token0.symbol?.slice(0, 2)}
                  </span>
                </div>
              )}
              {/* Chain Logo */}
              <img
                src={getLogoForChainId(chainId)}
                className="absolute -bottom-0.5 -right-0.5 w-3.75 h-3.75 rounded-full"
                alt="chain logo"
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0 ml-2.5">
              <div className="flex">
                <p className="text-[13px] font-normal">{market.pairName}</p>
                <p className="text-[12px] font-normal ml-0.75 text-gray-400">
                  {market.exchange.name}
                </p>
              </div>
              <div className="flex">
                <p className="text-[13px] font-normal text-gray-400">Liq:</p>
                <p className="text-[13px] font-normal ml-0.75">
                  {formatBigNumber(market.liquidity || 0)}
                </p>
                <p className="text-[13px] font-normal ml-0.75 text-gray-400">
                  Vol:
                </p>
                <p className="text-[13px] font-normal ml-0.75">
                  {formatBigNumber(market.volume24h || 0)}
                </p>
              </div>
            </div>
            <div className="flex flex-col ml-auto mr-2.5">
              <div>
                <p className="text-[13px] font-normal">
                  ${formatBigNumber(market.liquidity || 0)}
                </p>
              </div>
              {market.priceChange24h !== null && (
                <div className="ml-auto">
                  <TokenPriceChange value={market.priceChange24h} />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </>
  );
}
