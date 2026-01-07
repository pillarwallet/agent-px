import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Copy,
  Download,
  Upload,
  Trash2,
  Settings,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { toast } from 'sonner';
import { createWalletClient, custom } from 'viem';
import { arbitrum } from 'viem/chains';
import useTransactionKit from '../../../hooks/useTransactionKit';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { generateAgentWallet } from '../lib/hyperliquid/signing';
import {
  storeAgentWallet,
  getAgentWallet,
  updateAgentApprovalRemote,
  clearAgentWallet,
} from '../lib/hyperliquid/keystore';
import {
  buildApproveAgentAction,
  getApproveAgentTypedData,
} from '../lib/hyperliquid/signing';
import { postExchange } from '../lib/hyperliquid/client';
import { ValidationStatus } from './ValidationStatus';

type AgentStatus = 'none' | 'created' | 'approved';

interface AgentControlsProps {
  onStatusChange?: () => void;
}

export function AgentControls({ onStatusChange }: AgentControlsProps) {
  const { walletAddress: address, walletProvider } = useTransactionKit();
  // Removed useWalletClient from wagmi
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('none');
  const [agentAddress, setAgentAddress] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  const [agentPrivateKey, setAgentPrivateKey] = useState<string>('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importAccountAddress, setImportAccountAddress] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [validationStatus, setValidationStatus] = useState<
    'idle' | 'validating' | 'success' | 'error'
  >('idle');
  const [validationData, setValidationData] = useState<{
    agentAddress?: string;
    balance?: string;
    openPositions?: number;
    errorMessage?: string;
  }>({});

  // Auto-fetch imported account from global storage
  useEffect(() => {
    const loadImportedAccount = async () => {
      setIsLoadingAgent(true);
      try {
        const { getImportedAccount } = await import(
          '../lib/hyperliquid/keystore'
        );
        const imported = getImportedAccount();

        if (imported) {
          setAgentAddress(imported.accountAddress);
          setAgentPrivateKey(imported.privateKey);
          setAgentStatus('approved');
          console.log(
            '[AgentControls] Imported account loaded:',
            imported.accountAddress
          );
        } else {
          setAgentStatus('none');
          setAgentAddress('');
          setAgentPrivateKey('');
        }
      } catch (error) {
        console.error('[AgentControls] Error loading imported account:', error);
        setAgentStatus('none');
        setAgentAddress('');
      } finally {
        setIsLoadingAgent(false);
      }
    };

    loadImportedAccount();
  }, []);

  const handleCreateAgent = async () => {
    console.log('handleCreateAgent called', { address });
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsCreating(true);
    try {
      console.log('Checking for existing agent wallet...');
      // Check if agent wallet already exists
      const existing = await getAgentWallet(address);
      console.log('Existing agent check result:', existing);

      if (existing) {
        setAgentAddress(existing.address);
        setAgentStatus(existing.approved ? 'approved' : 'created');
        toast.success('Agent wallet already exists!', {
          description: `Address: ${existing.address.slice(0, 10)}...`,
        });
        return;
      }

      console.log('Generating new agent wallet...');
      // Create new agent wallet
      const wallet = generateAgentWallet();
      console.log('Generated wallet:', wallet.address);

      console.log('Storing agent wallet...');
      await storeAgentWallet(address, wallet.address, wallet.privateKey, false);
      console.log('Agent wallet stored');

      setAgentAddress(wallet.address);
      setAgentPrivateKey(wallet.privateKey);
      setAgentStatus('created');
      toast.success('Agent wallet created!', {
        description: `Address: ${wallet.address.slice(0, 10)}...`,
      });
    } catch (error: any) {
      console.error('Agent creation error:', error);
      toast.error('Failed to create agent wallet', {
        description: error.message,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleApproveAgent = async () => {
    if (!address || !walletProvider) {
      toast.error('Please connect your wallet');
      return;
    }

    const agent = await getAgentWallet(address);
    if (!agent) {
      toast.error('No agent wallet found');
      return;
    }

    if (agent.approved) {
      toast.success('Agent is already approved');
      setAgentStatus('approved');
      return;
    }

    setIsApproving(true);
    try {
      console.log('Building approval action...');
      console.log('WalletProvider object:', walletProvider);

      let accountToUse = address as Hex;

      // Probe walletProvider structure
      if (walletProvider) {
        console.log('walletProvider keys:', Object.keys(walletProvider));
        // Check if we need to request accounts
        if ('request' in walletProvider) {
          try {
            // @ts-ignore
            const accounts = await walletProvider.request({
              method: 'eth_accounts',
            });
            console.log('Connected accounts:', accounts);
            if (accounts && Array.isArray(accounts) && accounts.length > 0) {
              // Use the account from the provider to ensure case match
              accountToUse = accounts[0];
              console.log('Using provider account:', accountToUse);
            } else {
              console.warn(
                'No accounts found from provider. Requesting access...'
              );
              // @ts-ignore
              const requested = await walletProvider.request({
                method: 'eth_requestAccounts',
              });
              if (
                requested &&
                Array.isArray(requested) &&
                requested.length > 0
              ) {
                accountToUse = requested[0];
              }
            }
          } catch (e) {
            console.error('Error checking accounts:', e);
          }

          // Check chain ID and switch if necessary
          try {
            // @ts-ignore
            const chainId = await walletProvider.request({
              method: 'eth_chainId',
            });
            console.log('Current Chain ID:', chainId);
            const targetChainId = '0xa4b1'; // Arbitrum One

            if (chainId !== targetChainId) {
              console.log(`Switching to Arbitrum (${targetChainId})...`);
              try {
                // @ts-ignore
                await walletProvider.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: targetChainId }],
                });
              } catch (switchError: any) {
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                  console.log('Chain not found, adding Arbitrum...');
                  // @ts-ignore
                  await walletProvider.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                      {
                        chainId: targetChainId,
                        chainName: 'Arbitrum One',
                        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                        nativeCurrency: {
                          name: 'Ether',
                          symbol: 'ETH',
                          decimals: 18,
                        },
                        blockExplorerUrls: ['https://arbiscan.io'],
                      },
                    ],
                  });
                } else {
                  throw switchError;
                }
              }
            }
          } catch (e) {
            console.error('Error switching chain:', e);
            toast.error(
              'Failed to switch network. Please switch to Arbitrum manually.'
            );
            setIsApproving(false);
            return;
          }
        }
      }

      const actionConfig = buildApproveAgentAction({
        agentAddress: agent.address,
        nonce: Date.now(),
      });

      // Get EIP-712 typed data structures
      const { domain, types, primaryType, message } = getApproveAgentTypedData(
        actionConfig.hyperliquidChain,
        actionConfig.signatureChainId,
        actionConfig.agentAddress,
        actionConfig.agentName,
        actionConfig.nonce
      );

      console.log('Requesting signature...');
      // Note: walletProvider is already a viem WalletClient in this context
      // We cast it to any/WalletClient to access signTypedData
      const signature = await (walletProvider as any).signTypedData({
        account: accountToUse,
        domain,
        types,
        primaryType,
        message,
      });

      console.log('Signature received');

      // Ensure agent address is lowercase for API
      // And include signatureChainId as it is required by the API
      const apiAction = {
        ...actionConfig,
        agentAddress: actionConfig.agentAddress.toLowerCase(),
      };

      const payload = {
        action: apiAction,
        nonce: actionConfig.nonce,
        signature: {
          r: signature.slice(0, 66),
          s: '0x' + signature.slice(66, 130),
          v: parseInt(signature.slice(130, 132), 16),
        },
        vaultAddress: null,
      };

      console.log(
        'Posting agent approval to Hyperliquid...',
        JSON.stringify(payload)
      );
      const response = await postExchange(payload);

      console.log('Approval result:', response);

      if (response.status === 'ok') {
        // Store approval status locally
        await storeAgentWallet(address, agent.address, agent.privateKey, true);
        setAgentStatus('approved');
        toast.success('Agent approved successfully!');

        if (onStatusChange) {
          onStatusChange();
        }
      } else {
        throw new Error(
          response.response?.data?.toString() || 'Approval failed'
        );
      }
    } catch (error: any) {
      console.error('Approval error:', error);
      toast.error('Failed to approve agent', {
        description: error.message,
      });
    } finally {
      setIsApproving(false);
    }
  };

  const copyAddress = () => {
    if (agentAddress) {
      navigator.clipboard.writeText(agentAddress);
      toast.success('Agent address copied!');
    }
  };

  const copyPrivateKey = () => {
    if (agentPrivateKey) {
      navigator.clipboard.writeText(agentPrivateKey);
      toast.success('Private key copied to clipboard!');
    }
  };

  const downloadPrivateKey = () => {
    if (agentPrivateKey && agentAddress) {
      const data = JSON.stringify(
        {
          address: agentAddress,
          privateKey: agentPrivateKey,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      );

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-wallet-${agentAddress.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Private key downloaded!');
    }
  };

  const handleRemoveAccount = async () => {
    try {
      const { clearImportedAccount } = await import(
        '../lib/hyperliquid/keystore'
      );
      clearImportedAccount();

      setAgentAddress('');
      setAgentPrivateKey('');
      setAgentStatus('none');
      setValidationStatus('idle');
      setValidationData({});

      toast.success('Imported account removed');

      // Trigger data refresh to clear displayed data
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error: any) {
      console.error('[AgentControls] Error removing account:', error);
      toast.error('Failed to remove account');
    }
  };

  const handleImportAgent = async () => {
    if (!importAccountAddress.trim()) {
      toast.error('Please enter an account address');
      return;
    }

    if (!importPrivateKey.trim()) {
      toast.error('Please enter a private key');
      return;
    }

    // Show loading toast and set validating status
    const loadingToast = toast.loading('Validating agent credentials...');
    setValidationStatus('validating');
    setValidationData({});

    try {
      // Validate account address format
      if (!importAccountAddress.trim().match(/^0x[a-fA-F0-9]{40}$/)) {
        toast.dismiss(loadingToast);
        toast.error('Invalid account address format');
        return;
      }

      // Validate and derive address from private key
      const formattedKey = importPrivateKey.trim().startsWith('0x')
        ? (importPrivateKey.trim() as Hex)
        : (`0x${importPrivateKey.trim()}` as Hex);

      const account = privateKeyToAccount(formattedKey);

      console.log('[Import Agent] Validating account on Hyperliquid...');
      toast.loading('Checking Hyperliquid connection...', { id: loadingToast });

      // Validate that the ACCOUNT ADDRESS exists on Hyperliquid (not the agent)
      try {
        const { getUserState } = await import('../lib/hyperliquid/client');
        const accountState = await getUserState(importAccountAddress.trim());

        if (!accountState) {
          toast.dismiss(loadingToast);
          toast.error('Account address not found on Hyperliquid', {
            description:
              'This address has no Hyperliquid account. Please use a valid account address.',
          });
          return;
        }

        console.log('[Import Agent] Account validated:', {
          accountAddress: importAccountAddress.trim(),
          agentAddress: account.address,
          balance: accountState.marginSummary?.totalRawUsd,
          positions: accountState.assetPositions?.length || 0,
        });

        toast.loading('Saving credentials...', { id: loadingToast });

        // Store in GLOBAL storage (not tied to connected wallet)
        const { storeImportedAccount } = await import(
          '../lib/hyperliquid/keystore'
        );
        storeImportedAccount(importAccountAddress.trim(), formattedKey);

        setAgentAddress(importAccountAddress.trim()); // Monitor account address
        setAgentPrivateKey(formattedKey);
        setAgentStatus('approved');
        setShowImportDialog(false);
        setImportPrivateKey('');
        setImportAccountAddress('');

        toast.dismiss(loadingToast);

        const openPositions =
          accountState.assetPositions?.filter(
            (p: any) => parseFloat(p.position.szi) !== 0
          ).length || 0;

        // Set success status with ACCOUNT data
        setValidationStatus('success');
        setValidationData({
          agentAddress: importAccountAddress.trim(),
          balance: parseFloat(
            accountState.marginSummary?.totalRawUsd || '0'
          ).toFixed(2),
          openPositions,
        });

        toast.success('✅ Account imported and validated!', {
          description: `Balance: $${parseFloat(accountState.marginSummary?.totalRawUsd || '0').toFixed(2)} | Open Positions: ${openPositions}`,
          duration: 5000,
        });

        // Trigger data refresh
        if (onStatusChange) {
          console.log('[Import Agent] Triggering data refresh...');
          onStatusChange();
        }
      } catch (validationError: any) {
        toast.dismiss(loadingToast);
        console.error('[Import Agent] Validation error:', validationError);

        // Set error status
        setValidationStatus('error');
        setValidationData({
          errorMessage:
            validationError.message ||
            'Could not fetch agent data. Please check your internet connection and try again.',
        });

        toast.error('❌ Failed to connect to Hyperliquid', {
          description:
            validationError.message ||
            'Could not fetch agent data. Please check your internet connection and try again.',
          duration: 5000,
        });
        return;
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Import error:', error);
      toast.error('Invalid private key', {
        description: error.message || 'Please check the format and try again',
      });
    }
  };

  const handleRemoveAgent = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsRemoving(true);
    try {
      // Clear from remote first, then local
      await clearAgentWallet(address);

      // Verify deletion
      const stillExists = await getAgentWallet(address);
      if (stillExists) {
        throw new Error(
          'Agent wallet still exists after deletion. Please try again.'
        );
      }

      // Update UI
      setAgentAddress('');
      setAgentPrivateKey('');
      setAgentStatus('none');
      toast.success('Agent wallet removed from all storage');
      onStatusChange?.();
    } catch (error: any) {
      console.error('Remove agent error:', error);
      toast.error(error.message || 'Failed to remove agent wallet');
    } finally {
      setIsRemoving(false);
    }
  };

  const statusConfig = {
    none: {
      icon: AlertCircle,
      label: 'No Agent',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
    },
    created: {
      icon: AlertCircle,
      label: 'Not Approved',
      color: 'text-warning',
      bgColor: 'bg-warning/10 border-warning/30',
    },
    approved: {
      icon: CheckCircle2,
      label: 'Active',
      color: 'text-success',
      bgColor: 'bg-success/10 border-success/30',
    },
  };

  const config = statusConfig[agentStatus];
  const Icon = config.icon;

  return (
    <Card className="p-3 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Agent Wallet:</span>
              <Badge variant="outline" className={config.color}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            {agentAddress && (
              <div className="space-y-1 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}
                  </span>
                  <button
                    onClick={copyAddress}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation Status Display */}
      {validationStatus !== 'idle' && (
        <div className="mb-3">
          <ValidationStatus
            status={validationStatus}
            agentAddress={validationData.agentAddress}
            balance={validationData.balance}
            openPositions={validationData.openPositions}
            errorMessage={validationData.errorMessage}
          />
        </div>
      )}

      {agentStatus === 'none' && (
        <>
          {!address ? (
            <div className="text-sm text-muted-foreground text-center py-3">
              Please connect your wallet to create an agent
            </div>
          ) : isLoadingAgent ? (
            <div className="text-sm text-muted-foreground text-center py-3">
              Loading agent wallet...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Button
                  onClick={() => setShowImportDialog(true)}
                  disabled={isCreating}
                  className="w-full"
                  size="sm"
                >
                  <Upload className="h-3 w-3 mr-2" />
                  Import Agent
                </Button>
                <Button
                  onClick={handleCreateAgent}
                  disabled={isCreating}
                  className="w-full"
                  variant="outline"
                  size="sm"
                >
                  {isCreating ? 'Creating...' : 'Create New'}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground bg-muted border border-border rounded p-2">
                💡 Import your existing Hyperliquid agent or create a new one
              </div>
            </>
          )}
        </>
      )}

      <Dialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (open) {
            // Pre-fill with connected wallet address when dialog opens
            setImportAccountAddress(address || '');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Existing Agent</DialogTitle>
            <DialogDescription>
              Enter the private key of your Hyperliquid agent wallet and specify
              which account address to associate it with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="accountAddress">Account Address</Label>
              <Input
                id="accountAddress"
                type="text"
                placeholder="0x..."
                value={importAccountAddress}
                onChange={(e) => setImportAccountAddress(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is the PillarX account that will control the agent. You can
                change this to any address.
              </p>
            </div>
            <div>
              <Label htmlFor="privateKey">Agent Private Key</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="0x..."
                value={importPrivateKey}
                onChange={(e) => setImportPrivateKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The private key of your Hyperliquid agent wallet
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleImportAgent} className="flex-1">
                Import
              </Button>
              <Button
                onClick={() => setShowImportDialog(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {agentStatus === 'created' && (
        <div className="space-y-1.5">
          <Button
            onClick={handleApproveAgent}
            disabled={isApproving || !address}
            className="w-full"
            size="sm"
          >
            {isApproving
              ? 'Approving...'
              : 'Approve Agent (Sign with Master Wallet)'}
          </Button>
          <Button
            onClick={handleRemoveAgent}
            disabled={isRemoving || isApproving}
            variant="outline"
            className="w-full text-xs"
            size="sm"
          >
            {isRemoving ? 'Removing...' : 'Remove Agent'}
          </Button>
        </div>
      )}

      {agentStatus === 'approved' && (
        <div className="space-y-3">
          <div className="bg-success/10 border border-success/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">
                  Imported Account Active
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleRemoveAccount}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Address:</span>
              <div className="font-mono bg-background/50 rounded px-2 py-1 mt-1 text-[10px]">
                {agentAddress}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
