import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from './ui/input-otp';

interface UnlockWalletModalProps {
    isOpen: boolean;
    onUnlock: (pin: string) => Promise<boolean>;
    onClose: () => void;
}

export function UnlockWalletModal({ isOpen, onUnlock, onClose }: UnlockWalletModalProps) {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 4) {
            toast.error('PIN must be 4 digits');
            return;
        }

        setIsLoading(true);
        try {
            const success = await onUnlock(pin);
            if (success) {
                toast.success('Wallet unlocked!');
                setPin(''); // Clear PIN on success
            }
        } catch (error) {
            // Error handling is likely done in onUnlock or just toast here
            console.error('Unlock failed', error);
            toast.error('Incorrect PIN');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        Unlock Agent Wallet
                    </DialogTitle>
                    <DialogDescription>
                        Enter your PIN to unlock your trading agent.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-2 flex flex-col items-center">
                        <Label htmlFor="pin" className="w-full text-left">PIN Code</Label>
                        <InputOTP
                            maxLength={4}
                            value={pin}
                            onChange={(value) => setPin(value)}
                            disabled={isLoading}
                        >
                            <InputOTPGroup>
                                <InputOTPSlot index={0} masked />
                                <InputOTPSlot index={1} masked />
                                <InputOTPSlot index={2} masked />
                                <InputOTPSlot index={3} masked />
                            </InputOTPGroup>
                        </InputOTP>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading || pin.length !== 4}>
                            {isLoading ? 'Unlocking...' : 'Unlock'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
