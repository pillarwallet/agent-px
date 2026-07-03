import { useState } from 'react';
import { RiArrowDownLine } from 'react-icons/ri';
import { TailSpin } from 'react-loader-spinner';
import { isAddress } from 'viem';

import useTransactionKit from '../../../../hooks/useTransactionKit';

// utils
import { openExternalUrl } from '../../../../utils/pillarWalletMessaging';

// reducer
import { useAppDispatch } from '../../hooks/useReducerHooks';
import { setIsReceiveModalOpen } from '../../reducer/WalletPortfolioSlice';

// components
import ReceiveModal from '../ReceiveModal/ReceiveModal';
import BodySmall from '../Typography/BodySmall';

// icons
import FrameIcon from '../../images/Frame.svg';

const WalletPortfolioButtons = () => {
  const dispatch = useAppDispatch();
  const { walletAddress: accountAddress } = useTransactionKit();
  const [isAddCashLoading, setIsAddCashLoading] = useState(false);

  const handleAddCash = async () => {
    if (isAddCashLoading) return;

    setIsAddCashLoading(true);

    try {
      // Validate wallet address
      if (!accountAddress) {
        console.error('Wallet address is not available');
        // eslint-disable-next-line no-alert
        alert('Wallet address is not available. Please try again shortly.');
        return;
      }

      // Check if address is a valid Ethereum address
      if (!isAddress(accountAddress)) {
        console.error('Invalid wallet address format');
        // eslint-disable-next-line no-alert
        alert('Invalid wallet address format. Please try again shortly.');
        return;
      }

      // Get token from backend API
      const tokenUrl = new URL(import.meta.env.VITE_ONRAMP_JWT_URL);

      const tokenResponse = await fetch(tokenUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!tokenResponse.ok) {
        // eslint-disable-next-line no-console
        console.error(
          'Token response not OK:',
          tokenResponse.status,
          tokenResponse.statusText
        );
        // eslint-disable-next-line no-alert
        alert('Unable to reach the server. Please try again shortly.');
        return;
      }

      const tokenData = await tokenResponse.json();
      const { token } = tokenData;

      if (!token) {
        // eslint-disable-next-line no-console
        console.error('No token in response:', tokenData);
        // eslint-disable-next-line no-alert
        alert(
          'Something went wrong on fetching session token. Please try again shortly.'
        );
        return;
      }

      // Get user's current IP address
      let clientIp = '127.0.0.1'; // fallback
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        if (ipResponse.ok) {
          const ipData = await ipResponse.json();
          clientIp = ipData.ip;
        }
      } catch (ipError) {
        // eslint-disable-next-line no-console
        console.warn('Failed to get IP, using fallback:', ipError);
      }

      // Call Coinbase API to create onramp session (via proxy to avoid CORS)
      // This uses Vite proxy in dev and Cloudflare Pages Function in production
      const response = await fetch(
        '/api/coinbase/platform/v2/onramp/sessions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            purchaseCurrency: 'USDC',
            destinationNetwork: 'base',
            destinationAddress: accountAddress,
            paymentCurrency: 'USD',
            clientIp,
            redirectUrl: window.location.origin,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = `Coinbase API error (${response.status}): ${data.error || JSON.stringify(data)}`;
        // eslint-disable-next-line no-console
        console.error(errorMsg);
        // eslint-disable-next-line no-alert
        alert(
          'Something went wrong while fetching coinbase API. Please try again later.'
        );
        return;
      }

      const onrampUrl = data?.session?.onrampUrl;

      if (!onrampUrl) {
        // eslint-disable-next-line no-console
        console.error('No URL in response:', data);
        // eslint-disable-next-line no-alert
        alert(
          'Something went wrong while fetching coinbase API url. Please try again shortly.'
        );
        return;
      }

      // Open the URL in external browser (native browser if in webview, new tab if in regular browser)
      openExternalUrl(onrampUrl, 'noreferrer');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error opening add cash URL:', error);
      // eslint-disable-next-line no-alert
      alert(
        'Error occurred while opening add cash page. Please try again shortly.'
      );
    } finally {
      setIsAddCashLoading(false);
    }
  };

  return (
    <div className="flex w-full items-center justify-between gap-2.5">
      <ReceiveModal />
      <button
        type="button"
        className="flex py-[9px] px-3 w-fit h-[44px] items-center justify-center border-x-2 border-t-2 border-b-4 rounded-[10px] border-[#121116] cursor-pointer"
        onClick={() => dispatch(setIsReceiveModalOpen(true))}
      >
        <div className="flex gap-2 items-center justify-center rounded-lg cursor-pointer">
          <BodySmall>Receive</BodySmall>
          <RiArrowDownLine size={16} color="white" />
        </div>
      </button>
      <button
        type="button"
        className="flex py-[9px] px-3 w-fit h-[44px] items-center justify-center border-x-2 border-t-2 border-b-4 rounded-[10px] border-[#121116] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleAddCash}
        disabled={isAddCashLoading || !accountAddress}
      >
        <div className="flex gap-2 items-center justify-center rounded-lg">
          <span className="text-white font-medium text-[14px] leading-[14px] tracking-[-0.02em] text-center align-bottom">
            Add Cash
          </span>
          {isAddCashLoading && (
            <TailSpin color="#FFFFFF" height={16} width={16} />
          )}
          {!isAddCashLoading && (
            <img src={FrameIcon} alt="Add Cash" width={16} height={16} />
          )}
        </div>
      </button>
    </div>
  );
};

export default WalletPortfolioButtons;
