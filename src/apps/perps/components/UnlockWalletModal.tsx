import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

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
        if (pin.length < 4) {
            toast.error('PIN must be at least 4 digits');
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

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="pin">PIN Code</Label>
                        <Input
                            id="pin"
                            type="password"
                            placeholder="Enter PIN"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="text-center text-lg tracking-widest"
                            autoFocus
                            maxLength={6}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading || pin.length < 4}>
                            {isLoading ? 'Unlocking...' : 'Unlock'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
