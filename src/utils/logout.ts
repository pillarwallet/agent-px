import { useAccount, useDisconnect } from 'wagmi';

import {
  clearPhoneOtpSession,
  hasPhoneOtpEncryptedVault,
} from './phoneOtpAuth';

/**
 * Custom hook that provides comprehensive logout functionality
 * Handles local auth/session cleanup and WAGMI disconnection
 */
export const useComprehensiveLogout = () => {
  const { isConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const logout = async () => {
    // First, disconnect from WAGMI if connected
    if (isConnected) {
      try {
        await wagmiDisconnect();
      } catch (e) {
        console.error('Error disconnecting from WAGMI:', e);
      }
    }

    // Clear any stored data
    try {
      clearPhoneOtpSession({
        preserveLinkedPhoneData: hasPhoneOtpEncryptedVault(),
      });
      sessionStorage.clear();
    } catch (e) {
      console.error('Error clearing storage:', e);
    }
  };

  return { logout };
};
