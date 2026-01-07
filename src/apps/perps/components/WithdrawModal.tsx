import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ArrowUpDown } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { postExchange } from '../lib/hyperliquid/client';
import { getAgentWallet } from '../lib/hyperliquid/keystore';
import { signAgentAction } from '../lib/hyperliquid/signing';
import type { Hex } from 'viem';
import type { UserState } from '../lib/hyperliquid/types';

interface WithdrawModalProps {
  userState: UserState;
  masterAddress: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  disabled?: boolean;
}

export function WithdrawModal({
  userState,
  masterAddress,
  onSuccess,
  trigger,
  disabled,
}: WithdrawModalProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const availableBalance = userState?.marginSummary?.accountValue
    ? parseFloat(userState.marginSummary.accountValue) -
      parseFloat(userState.marginSummary.totalMarginUsed)
    : 0;

  const handleMaxClick = () => {
    // Leave a small buffer for potential fees/margin
    const maxWithdrawable = Math.max(0, availableBalance - 0.1);
    setAmount(maxWithdrawable.toFixed(2));
  };

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    if (parseFloat(amount) > availableBalance) {
      toast({
        title: 'Insufficient Balance',
        description: `You can only withdraw up to $${availableBalance.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    if (parseFloat(amount) < 1) {
      toast({
        title: 'Amount Too Low',
        description: 'Minimum withdrawal is 1 USDC',
        variant: 'destructive',
      });
      return;
    }

    const agentWallet = getAgentWallet();
    if (!agentWallet) {
      toast({
        title: 'No Agent Wallet',
        description: 'Please create an agent wallet first',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const nonce = Date.now();

      // Build the usdSend action
      const action = {
        type: 'usdSend',
        hyperliquidChain: 'Mainnet',
        signatureChainId: '0xa4b1', // Arbitrum
        destination: masterAddress,
        amount: amount,
        time: nonce,
      };

      // Sign the action with the agent's private key
      const signature = await signAgentAction(
        agentWallet.privateKey as Hex,
        action,
        nonce
      );

      // Send the signed action to Hyperliquid
      const response = await postExchange({
        action,
        nonce,
        signature,
        vaultAddress: null,
      });

      if (response.status === 'ok') {
        toast({
          title: 'Withdrawal Successful!',
          description: `Successfully withdrew $${amount} USDC to your wallet`,
        });
        setAmount('');
        setOpen(false);
        onSuccess?.();
      } else {
        throw new Error(response.response || 'Withdrawal failed');
      }
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast({
        title: 'Withdrawal Failed',
        description: error.message || 'Failed to withdraw USDC',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" disabled={disabled}>
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Withdraw
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw USDC</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Available to Withdraw
            </Label>
            <p className="text-2xl font-bold">${availableBalance.toFixed(2)}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Destination</Label>
            <p className="text-sm font-mono bg-muted rounded p-2 break-all">
              {masterAddress}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount">Amount (USDC)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMaxClick}
                disabled={availableBalance <= 0}
                className="h-6 text-xs"
              >
                Max
              </Button>
            </div>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isLoading}
              step="0.01"
              min="0"
            />
          </div>

          <div className="rounded-lg bg-muted p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Network:</span>
              <span className="text-muted-foreground">Hyperliquid L1</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Transfer Time:</span>
              <span className="text-muted-foreground">Instant</span>
            </div>
          </div>

          <Button
            onClick={handleWithdraw}
            disabled={
              isLoading ||
              !amount ||
              parseFloat(amount) <= 0 ||
              parseFloat(amount) > availableBalance
            }
            className="w-full"
          >
            {isLoading ? 'Processing...' : 'Withdraw to Master Wallet'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
