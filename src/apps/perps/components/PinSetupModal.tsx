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
        if (pin.length !== 4) {
            toast.error('PIN must be 4 digits');
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
                        Create a 4-digit PIN to secure your agent wallet.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-2 flex flex-col items-center">
                        <Label htmlFor="pin" className="w-full text-left">Enter PIN</Label>
                        <InputOTP
                            maxLength={4}
                            value={pin}
                            onChange={(value) => setPin(value)}
                        >
                            <InputOTPGroup>
                                <InputOTPSlot index={0} masked />
                                <InputOTPSlot index={1} masked />
                                <InputOTPSlot index={2} masked />
                                <InputOTPSlot index={3} masked />
                            </InputOTPGroup>
                        </InputOTP>
                    </div>

                    <div className="space-y-2 flex flex-col items-center">
                        <Label htmlFor="confirmPin" className="w-full text-left">Confirm PIN</Label>
                        <InputOTP
                            maxLength={4}
                            value={confirmPin}
                            onChange={(value) => setConfirmPin(value)}
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
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pin.length !== 4 || pin !== confirmPin}>
                            Confirm & Create
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
