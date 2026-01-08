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

interface PinSetupModalProps {
    isOpen: boolean;
    onConfirm: (pin: string) => void;
    onCancel: () => void;
}

export function PinSetupModal({ isOpen, onConfirm, onCancel }: PinSetupModalProps) {
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length < 4) {
            toast.error('PIN must be at least 4 digits');
            return;
        }
        if (pin !== confirmPin) {
            toast.error('PINs do not match');
            return;
        }

        onConfirm(pin);
        // Reset state
        setPin('');
        setConfirmPin('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        Set Wallet PIN
                    </DialogTitle>
                    <DialogDescription>
                        Create a PIN to secure your agent wallet. You will need this to unlock trading sessions.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="pin">Enter PIN</Label>
                        <Input
                            id="pin"
                            type="password"
                            placeholder="Create PIN"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="text-center text-lg tracking-widest"
                            autoFocus
                            maxLength={6}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPin">Confirm PIN</Label>
                        <Input
                            id="confirmPin"
                            type="password"
                            placeholder="Confirm PIN"
                            value={confirmPin}
                            onChange={(e) => setConfirmPin(e.target.value)}
                            className="text-center text-lg tracking-widest"
                            maxLength={6}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!pin || pin !== confirmPin}>
                            Confirm & Create
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
