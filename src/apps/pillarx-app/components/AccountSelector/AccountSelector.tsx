// hooks
import useTransactionKit from '../../../../hooks/useTransactionKit';

// images
import WalletPortfolioIcon from '../../images/wallet-portfolio-icon.png';

const truncateAddress = (address: string) => {
  if (!address) return 'EOA Delegation';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const AccountSelector = () => {
  const { walletAddress } = useTransactionKit();

  return (
    <div className="flex items-center gap-2">
      <img
        src={WalletPortfolioIcon}
        alt="wallet-portfolio-icon"
        className="w-8 h-6"
      />
      <div className="flex flex-col items-start">
        <span className="text-white text-sm font-medium">My portfolio</span>
        <span className="text-white/50 text-[11px]">
          {truncateAddress(walletAddress || '')}
        </span>
      </div>
    </div>
  );
};

export default AccountSelector;
