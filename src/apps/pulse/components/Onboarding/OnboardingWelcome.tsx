// assets
import { TailSpin } from 'react-loader-spinner';
import WalletIcon from '../../assets/wallet.svg';
import GasTankIcon from '../../assets/gas-tank-icon.svg';

interface OnboardingWelcomeProps {
  onComplete: () => void;
  totalUsdcBalance: number;
  gasTankBalance: number;
  isGasTankLoading?: boolean;
}

export default function OnboardingWelcome(props: OnboardingWelcomeProps) {
  const {
    onComplete,
    totalUsdcBalance,
    gasTankBalance,
    isGasTankLoading = false,
  } = props;

  return (
    <div className="w-full max-w-[446px]">
      <div
        className="w-full rounded-2xl bg-[#1E1D24] pt-9 px-3 pb-3 flex flex-col gap-9"
        data-testid="pulse-onboarding-welcome"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">👋 Welcome to</span>
          </div>
          <h2
            className="font-bold italic text-white text-center text-xl leading-5 tracking-tight"
            style={{ fontFamily: 'Druk Text Wide' }}
          >
            PULSE APP
          </h2>
        </div>

        {/* Description and Balance Cards */}
        <div className="p-3 flex flex-col gap-3 items-center">
          <p className="text-white text-center text-sm leading-4 tracking-tight opacity-50 font-normal">
            To start trading, fund your account with USDC, top up your gas tank
            and enable trading.
          </p>
          {/* All Networks Card */}
          <div className="flex items-center w-full max-w-[250px] h-[34px] rounded-lg py-2 px-3 gap-0.5 bg-[#8A77FF1A]">
            <img src={WalletIcon} alt="Wallet" className="w-6 h-[18px]" />
            <span className="text-sm font-normal text-white">
              All Networks:{' '}
              {totalUsdcBalance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              <span className="text-white/50">USDC</span>
            </span>
          </div>

          {/* Gas Tank Card */}
          <div className="flex items-center w-full max-w-[250px] h-[34px] rounded-lg py-2 px-3 gap-0.5 bg-[#8A77FF1A]">
            <div className="w-6 h-6 flex items-center justify-center rounded">
              <img
                src={GasTankIcon}
                alt="Gas Tank"
                className="w-5 h-[18px] text-[#8A77FF]"
              />
            </div>
            <span className="text-sm font-normal text-white">
              Universal Gas Tank: $
              {gasTankBalance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Top Up Button */}
        <div className="w-full rounded-[10px] bg-black p-[2px_2px_6px_2px]">
          <button
            onClick={onComplete}
            type="button"
            className={`flex items-center justify-center w-full rounded-lg h-12 text-white font-medium text-base disabled:opacity-50 ${
              isGasTankLoading ? 'bg-[#29292F]' : 'bg-[#8A77FF]'
            }`}
            disabled={isGasTankLoading}
            data-testid="pulse-onboarding-top-up-button"
          >
            {isGasTankLoading ? (
              <div className="flex items-center justify-center gap-2">
                <TailSpin color="#FFFFFF" height={20} width={20} />
                <span>Loading...</span>
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
