import { useState, useCallback } from 'react';
import { useWalletClient } from 'wagmi';
import useTransactionKit from '../../../hooks/useTransactionKit';
import {
  getUserState,
  postExchange,
  getAllAssets,
  getOpenOrders,
} from '../lib/hyperliquid/client';
import {
  signUserAction,
  buildNoopAction,
  buildOrderAction,
} from '../lib/hyperliquid/signing';
import type { UserState, CopyTile, HyperliquidOrder, EnhancedAsset } from '../lib/hyperliquid/types';
import {
  calculatePositionSize,
  roundToSzDecimals,
  getEntryPrice,
  validateCopyTrade,
} from '../lib/hyperliquid/math';
import { toast } from 'sonner';
import {
  getAgentAddress,
} from '../lib/hyperliquid/keystore';

type SetupStatus = 'unknown' | 'not-setup' | 'setup';

export function useHyperliquid() {
  const { walletAddress: address } = useTransactionKit();
  const { data: walletClient } = useWalletClient();
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('unknown');
  const [userState, setUserState] = useState<UserState | null>(null);
  const [openOrders, setOpenOrders] = useState<HyperliquidOrder[]>([]);
  const [availableAssets, setAvailableAssets] = useState<EnhancedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ... existing imports

  const checkSetupStatus = useCallback(async () => {
    // Always fetch assets on load
    try {
      const assets = await getAllAssets();
      setAvailableAssets(assets);
    } catch (e) {
      console.error("Failed to fetch assets", e);
    }

    if (!address) {
      setSetupStatus('unknown');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Try Main Address
      let targetAddress = address;
      let state = await getUserState(address);
      let orders = await getOpenOrders(address);

      // 2. If Main is empty, checks if we have an active Agent with funds
      // (This handles the case where user Imported an Account as an Agent)
      if ((!state || parseFloat(state.marginSummary?.accountValue || '0') === 0) && !orders.length) {
        const agentAddress = getAgentAddress(address);
        if (agentAddress) {
          const agentState = await getUserState(agentAddress);
          const agentOrders = await getOpenOrders(agentAddress);

          // If agent has funds or orders, use agent
          if (agentState && (parseFloat(agentState.marginSummary?.accountValue || '0') > 0 || agentOrders.length > 0)) {
            targetAddress = agentAddress;
            state = agentState;
            orders = agentOrders;
            console.log('Using Agent Address for State:', agentAddress);
          }
        }
      }

      if (state) {
        setSetupStatus('setup');
        setUserState(state);
      } else {
        setSetupStatus('not-setup');
      }
      if (orders) {
        setOpenOrders(orders);
      }
    } catch (error) {
      console.error('Error checking setup status:', error);
      setSetupStatus('not-setup');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  const setupHyperliquid = useCallback(async () => {
    if (!walletClient || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    try {
      const action = buildNoopAction();
      const nonce = Date.now();
      const signature = await signUserAction(walletClient, action, nonce);

      await postExchange({
        action,
        nonce,
        signature,
      });

      toast.success('Hyperliquid account set up successfully!');
      setSetupStatus('setup');
      await checkSetupStatus();
    } catch (error: any) {
      console.error('Setup error:', error);
      toast.error(error.message || 'Failed to setup Hyperliquid account');
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, checkSetupStatus]);

  const loadBalance = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      // 1. Try Main Address
      let state = await getUserState(address);
      let orders = await getOpenOrders(address);

      // 2. Fallback to Agent if Main is empty
      if ((!state || parseFloat(state.marginSummary?.accountValue || '0') === 0) && (!orders || !orders.length)) {
        const agentAddress = getAgentAddress(address);
        if (agentAddress) {
          const agentState = await getUserState(agentAddress);
          const agentOrders = await getOpenOrders(agentAddress);

          if (agentState && (parseFloat(agentState.marginSummary?.accountValue || '0') > 0 || agentOrders.length > 0)) {
            state = agentState;
            orders = agentOrders;
          }
        }
      }

      if (state) {
        setUserState(state);
      }
      if (orders) {
        setOpenOrders(orders);
      }
    } catch (error) {
      console.error('Error loading balance:', error);
      toast.error('Failed to load balance');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  const executeCopyTrade = useCallback(
    async (tile: CopyTile) => {
      if (!walletClient || !address) {
        toast.error('Please connect your wallet');
        return;
      }

      if (setupStatus !== 'setup') {
        toast.error('Please setup your Hyperliquid account first');
        return;
      }

      // Validate the trade
      const validation = validateCopyTrade(tile);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }

      setIsLoading(true);
      try {
        // Look up asset ID by symbol
        const assets = await getAllAssets();
        const asset = assets.find((a) => a.symbol === tile.symbol);

        if (!asset) {
          toast.error(`Asset ${tile.symbol} not found`);
          return;
        }

        const notional = 10; // $10
        const leverage = 5; // 5x
        const entryPrice = getEntryPrice(tile.entry);
        const size = calculatePositionSize(notional, leverage, entryPrice);
        const roundedSize = roundToSzDecimals(size, 3);

        toast.info('Placing entry order...', { duration: 2000 });

        // Place entry order with numeric asset ID
        const entryAction = buildOrderAction({
          coin: asset.id,
          isBuy: tile.side === 'long',
          sz: roundedSize,
          limitPx: entryPrice,
          orderType: { limit: { tif: 'Gtc' } },
          reduceOnly: false,
        });

        const entryNonce = Date.now();
        const entrySignature = await signUserAction(
          walletClient,
          entryAction,
          entryNonce
        );

        const entryResult = await postExchange({
          action: entryAction,
          nonce: entryNonce,
          signature: entrySignature,
        });

        console.log('Entry order result:', entryResult);

        // Note: In production, you would also place SL and TP orders here
        // This is a simplified version for the MVP

        toast.success('Copy trade executed successfully!');
        await loadBalance();
      } catch (error: any) {
        console.error('Trade execution error:', error);
        toast.error(error.message || 'Failed to execute trade');
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, setupStatus, loadBalance]
  );

  return {
    setupStatus,
    userState,
    openOrders,
    isLoading,
    checkSetupStatus,
    setupHyperliquid,
    loadBalance,
    executeCopyTrade,
    availableAssets, // Export availableAssets
  };
}
