import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Shield, CheckCircle2, AlertCircle, Copy, Download, Eye, EyeOff, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { createWalletClient, custom } from 'viem';
import { arbitrum } from 'viem/chains';
import useTransactionKit from '../../../hooks/useTransactionKit';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { generateAgentWallet } from '../lib/hyperliquid/signing';
import { storeAgentWallet, getAgentWallet, updateAgentApprovalRemote, clearAgentWallet } from '../lib/hyperliquid/keystore';
import { buildApproveAgentAction, getApproveAgentTypedData } from '../lib/hyperliquid/signing';
import { postExchange } from '../lib/hyperliquid/client';

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
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [agentPrivateKey, setAgentPrivateKey] = useState<string>('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);

  // Auto-fetch agent wallet when master wallet connects
  useEffect(() => {
    const loadAgent = async () => {
      if (!address) {
        setAgentStatus('none');
        setAgentAddress('');
        return;
      }

      setIsLoadingAgent(true);
      try {
        const agent = await getAgentWallet(address);
        if (agent) {
          setAgentAddress(agent.address);
          setAgentPrivateKey(agent.privateKey);
          setAgentStatus(agent.approved ? 'approved' : 'created');
          console.log('Agent wallet loaded:', agent.address);
        } else {
          setAgentStatus('none');
          setAgentAddress('');
          setAgentPrivateKey('');
        }
      } catch (error) {
        console.error('Error loading agent:', error);
        setAgentStatus('none');
        setAgentAddress('');
      } finally {
        setIsLoadingAgent(false);
      }
    };

    loadAgent();
  }, [address]);

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
        description: error.message
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
            const accounts = await walletProvider.request({ method: 'eth_accounts' });
            console.log('Connected accounts:', accounts);
            if (accounts && Array.isArray(accounts) && accounts.length > 0) {
              // Use the account from the provider to ensure case match
              accountToUse = accounts[0];
              console.log('Using provider account:', accountToUse);
            } else {
              console.warn('No accounts found from provider. Requesting access...');
              // @ts-ignore
              const requested = await walletProvider.request({ method: 'eth_requestAccounts' });
              if (requested && Array.isArray(requested) && requested.length > 0) {
                accountToUse = requested[0];
              }
            }
          } catch (e) {
            console.error('Error checking accounts:', e);
          }

          // Check chain ID and switch if necessary
          try {
            // @ts-ignore
            const chainId = await walletProvider.request({ method: 'eth_chainId' });
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
                    params: [{
                      chainId: targetChainId,
                      chainName: 'Arbitrum One',
                      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                      nativeCurrency: {
                        name: 'Ether',
                        symbol: 'ETH',
                        decimals: 18
                      },
                      blockExplorerUrls: ['https://arbiscan.io']
                    }],
                  });
                } else {
                  throw switchError;
                }
              }
            }
          } catch (e) {
            console.error('Error switching chain:', e);
            toast.error('Failed to switch network. Please switch to Arbitrum manually.');
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

      console.log('Posting agent approval to Hyperliquid...', JSON.stringify(payload));
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
        throw new Error(response.response?.data?.toString() || 'Approval failed');
      }

    } catch (error: any) {
      console.error('Approval error:', error);
      toast.error('Failed to approve agent', {
        description: error.message
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
      const data = JSON.stringify({
        address: agentAddress,
        privateKey: agentPrivateKey,
        createdAt: new Date().toISOString(),
      }, null, 2);

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

  const handleImportAgent = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!importPrivateKey.trim()) {
      toast.error('Please enter a private key');
      return;
    }

    try {
      // Validate and derive address from private key
      const formattedKey = importPrivateKey.trim().startsWith('0x')
        ? importPrivateKey.trim() as Hex
        : `0x${importPrivateKey.trim()}` as Hex;

      const account = privateKeyToAccount(formattedKey);

      // Store the imported agent
      await storeAgentWallet(address, account.address, formattedKey, false);

      setAgentAddress(account.address);
      setAgentPrivateKey(formattedKey);
      setAgentStatus('created');
      setShowImportDialog(false);
      setImportPrivateKey('');

      toast.success('Agent wallet imported!', {
        description: `Address: ${account.address.slice(0, 10)}...`,
      });
    } catch (error: any) {
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
        throw new Error('Agent wallet still exists after deletion. Please try again.');
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
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Agent Wallet:</span>
              <Badge variant="outline" className={config.color}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            {agentAddress && (
              <div className="space-y-2 mt-2">
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

                {agentPrivateKey && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        className="h-7 text-xs"
                      >
                        {showPrivateKey ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                        {showPrivateKey ? 'Hide' : 'Show'} Private Key
                      </Button>
                      {showPrivateKey && (
                        <>
                          <button
                            onClick={copyPrivateKey}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy private key"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            onClick={downloadPrivateKey}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Download private key"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>

                    {showPrivateKey && (
                      <div className="bg-muted border border-border rounded p-2">
                        <div className="text-xs font-mono text-muted-foreground break-all">
                          {agentPrivateKey}
                        </div>
                        <div className="text-xs text-destructive mt-2 flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>Never share your private key! Anyone with access can control this wallet.</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {agentStatus === 'none' && (
        <>
          {!address ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Please connect your wallet to create an agent
            </div>
          ) : isLoadingAgent ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Loading agent wallet...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Button
                  onClick={() => setShowImportDialog(true)}
                  disabled={isCreating}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import Agent
                </Button>
                <Button
                  onClick={handleCreateAgent}
                  disabled={isCreating}
                  className="w-full"
                  variant="outline"
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

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Existing Agent</DialogTitle>
            <DialogDescription>
              Enter the private key of your Hyperliquid agent wallet (e.g., the one you created as trading-agent)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="privateKey">Private Key</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="0x..."
                value={importPrivateKey}
                onChange={(e) => setImportPrivateKey(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleImportAgent} className="flex-1">
                Import
              </Button>
              <Button onClick={() => setShowImportDialog(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {agentStatus === 'created' && (
        <div className="space-y-2">
          <Button
            onClick={handleApproveAgent}
            disabled={isApproving || !address}
            className="w-full"
          >
            {isApproving ? 'Approving...' : 'Approve Agent (Sign with Master Wallet)'}
          </Button>
          <Button
            onClick={handleRemoveAgent}
            disabled={isRemoving || isApproving}
            variant="outline"
            className="w-full text-xs"
          >
            {isRemoving ? 'Removing...' : 'Remove Agent'}
          </Button>
        </div>
      )}

      {agentStatus === 'approved' && (
        <div className="space-y-3">
          <div className="text-sm text-success">
            ✓ Agent is active and ready to trade
          </div>
          <Button
            onClick={handleRemoveAgent}
            disabled={isRemoving}
            variant="outline"
            className="w-full text-xs"
          >
            {isRemoving ? 'Removing...' : 'Remove Agent'}
          </Button>
        </div>
      )}
    </Card>
  );
}
