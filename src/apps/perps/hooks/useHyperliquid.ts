import { useState, useCallback, useEffect } from 'react';
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
import type {
  UserState,
  CopyTile,
  HyperliquidOrder,
  EnhancedAsset,
} from '../lib/hyperliquid/types';
import {
  calculatePositionSize,
  roundToSzDecimals,
  getEntryPrice,
  validateCopyTrade,
} from '../lib/hyperliquid/math';
import { toast } from 'sonner';
import { getAgentAddress } from '../lib/hyperliquid/keystore';
import { createWalletClient, custom } from 'viem';
import { arbitrum } from 'viem/chains';

type SetupStatus = 'unknown' | 'not-setup' | 'setup';

export function useHyperliquid() {
  const { kit } = useTransactionKit();
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('unknown');
  const [userState, setUserState] = useState<UserState | null>(null);
  const [masterUserState, setMasterUserState] = useState<UserState | null>(
    null
  );
  const [openOrders, setOpenOrders] = useState<HyperliquidOrder[]>([]);
  const [availableAssets, setAvailableAssets] = useState<EnhancedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [walletClient, setWalletClient] = useState<any>(null);

  const provider = kit.getProvider();

  const checkSetupStatus = useCallback(async () => {
    const walletProvider = kit.getEtherspotProvider();
    const eoa = (await walletProvider.getSdk()).getEOAAddress() || null;
    setAddress(eoa);
    console.log('DEBUG: Wallet Provider:', eoa);

    const client = createWalletClient({
      account: eoa as `0x${string}`,
      chain: arbitrum,
      transport: custom(provider as any),
    });
    setWalletClient(client);
    console.log('DEBUG: Created walletClient for Hyperliquid:', client);
    console.log('address: ', client.account);
    // Always fetch assets on load
    try {
      const assets = await getAllAssets();
      setAvailableAssets(assets);
    } catch (e) {
      console.error('Failed to fetch assets', e);
    }

    if (!eoa) {
      setSetupStatus('unknown');
      setActiveAddress(null);
      return;
    }

    setIsLoading(true);
    try {
      console.log('DEBUG: Checking setup status for:', eoa);

      // 1. Fetch Main Address Data
      let targetAddress: string = eoa;
      let state = await getUserState(eoa);
      console.log('state: ', state);
      let orders = await getOpenOrders(eoa);

      // 2. Check Agent Address
      // Unconditional switch: If an agent is linked, we use it.
      // const agentAddress = getAgentAddress(eoa);
      // if (agentAddress) {
      //   console.log(
      //     'DEBUG: Found Agent Address, executing switch:',
      //     agentAddress
      //   );

      //   const agentState = await getUserState(agentAddress);
      //   const agentOrders = await getOpenOrders(agentAddress);

      //   targetAddress = agentAddress as string;
      //   state = agentState;
      //   orders = agentOrders;
      // }

      setActiveAddress(targetAddress);
      console.log('DEBUG: User State result for', targetAddress, state);

      if (state) {
        // Ensure assetPositions exists
        if (!state.assetPositions) {
          console.warn(
            'WARNING: assetPositions missing in state, defaulting to []'
          );
          state.assetPositions = [];
        }
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
  }, []);

  const setupHyperliquid = useCallback(async () => {
    const walletClient = createWalletClient({
      account: address as `0x${string}`,
      chain: arbitrum,
      transport: custom(provider as any),
    });
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
  }, [address, checkSetupStatus]);

  const loadBalance = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      // Same logic as checkSetupStatus to determine active address
      let targetAddress: string = address;
      let state = await getUserState(address);
      let orders = await getOpenOrders(address);

      // const agentAddress = getAgentAddress(address);
      // if (agentAddress) {
      //   console.log(
      //     'DEBUG: Found Agent Address in loadBalance, executing switch:',
      //     agentAddress
      //   );
      //   const agentState = await getUserState(agentAddress);
      //   const agentOrders = await getOpenOrders(agentAddress);

      //   targetAddress = agentAddress as string;
      //   state = agentState;
      //   orders = agentOrders;
      // }

      setActiveAddress(targetAddress);

      console.log(
        'DEBUG: Final User State to be set:',
        JSON.stringify(state, null, 2)
      );

      if (state) {
        // Ensure assetPositions exists
        if (!state.assetPositions) {
          console.warn(
            'WARNING: assetPositions missing in state, defaulting to []'
          );
          state.assetPositions = [];
        }
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
      const walletClient = createWalletClient({
        account: address as `0x${string}`,
        chain: arbitrum,
        transport: custom(provider as any),
      });
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

        const notional = 5; // $5
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
    [address, setupStatus, loadBalance]
  );

  // Call checkSetupStatus on mount to initialize the address
  useEffect(() => {
    checkSetupStatus();
  }, []);

  return {
    setupStatus,
    userState,
    masterUserState,
    openOrders,
    isLoading,
    checkSetupStatus,
    setupHyperliquid,
    loadBalance,
    executeCopyTrade,
    availableAssets,
    activeAddress,
    address,
    walletClient,
  };
}
