// assets
import { TailSpin } from 'react-loader-spinner';
import WalletIcon from '../../assets/wallet.svg';
import GasTankIcon from '../../assets/gas-tank-icon.svg';

// utils
import { ChainNames } from '../../utils/blockchain';

interface OnboardingWelcomeProps {
  onComplete: () => void;
  gasTankBalance: number;
  isGasTankLoading?: boolean;
  maxStableCoinBalance?: {
    chainId: number;
    balance: number;
    price?: number;
  };
}

export default function OnboardingWelcome(props: OnboardingWelcomeProps) {
  const {
    onComplete,
    gasTankBalance,
    isGasTankLoading = false,
    maxStableCoinBalance,
  } = props;

  const maxStableCoinBalanceValue = maxStableCoinBalance?.balance ?? 0;

  return (
    <div className="w-full max-w-[446px]">
      <div
        className="w-full rounded-2xl bg-[#16151A] pt-9 px-3 pb-3 flex flex-col gap-9 shadow-[0px_2px_15px_0px_rgba(18,_17,_22,_0.5)]"
        data-testid="pulse-onboarding-welcome"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">👋 Welcome to</span>
          </div>
          <h2
            className="font-bold italic text-white text-center text-[32px] leading-6 tracking-[-0.02em]"
            style={{
              fontFamily: 'Druk Text Wide',
            }}
          >
            PULSE APP
          </h2>
        </div>

        {/* Description and Balance Cards */}
        <div className="p-3 flex flex-col gap-3 items-center">
          <p className="text-white text-center text-sm leading-4 tracking-tight opacity-50 font-normal max-w-[280px]">
            To start trading, you need $2 USDC on a network and $2 in your gas
            tank.
          </p>
          {/* Chain Balance Card */}
          <div className="flex items-center max-w-[250px] h-[34px] rounded-lg py-2 px-3 gap-0.5 bg-[#8A77FF1A]">
            <img src={WalletIcon} alt="Wallet" className="w-6 h-[18px]" />
            <span className="text-sm font-normal text-white">
              {ChainNames[maxStableCoinBalance?.chainId ?? 1] || 'All Networks'}
              :{' '}
              {maxStableCoinBalanceValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              <span className="text-white/50">USDC</span>
            </span>
          </div>

          {/* Gas Tank Card */}
          <div className="flex items-center max-w-[250px] rounded-lg py-2 px-3 gap-0.5 bg-[#8A77FF1A]">
            <img src={GasTankIcon} alt="Gas Tank" className="w-5" />
            <span className="text-sm font-normal text-white flex-1 flex items-center gap-1">
              Universal Gas Tank:{' '}
              {isGasTankLoading ? (
                <span className="inline-flex">
                  <TailSpin color="#FFFFFF" height={16} width={16} />
                </span>
              ) : (
                <>
                  $
                  {gasTankBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Top Up Button */}
        <div className="w-full rounded-[10px] bg-black p-[2px_2px_6px_2px]">
          <button
            onClick={onComplete}
            type="button"
            className={`flex items-center justify-center w-full rounded-lg h-12 text-white font-medium text-base disabled:opacity-50 ${
              isGasTankLoading ||
              (gasTankBalance >= 2 && maxStableCoinBalanceValue >= 2)
                ? 'bg-[#29292F]'
                : 'bg-[#8A77FF]'
            }`}
            disabled={
              isGasTankLoading ||
              (gasTankBalance >= 2 && maxStableCoinBalanceValue >= 2)
            }
            data-testid="pulse-onboarding-top-up-button"
          >
            {isGasTankLoading ||
            (gasTankBalance >= 2 && maxStableCoinBalanceValue >= 2) ? (
              <div className="flex items-center justify-center gap-2">
                <TailSpin color="#FFFFFF" height={20} width={20} />
                <span>
                  {gasTankBalance >= 2 && maxStableCoinBalanceValue >= 2
                    ? 'Funded'
                    : 'Loading...'}
                </span>
              </div>
            ) : (
              'Top up'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
