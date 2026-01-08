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
import { Copy, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface PrivateKeyModalProps {
    isOpen: boolean;
    address: string;
    privateKey: string;
    onClose: () => void;
    mode?: 'created' | 'revealed';
}

export function PrivateKeyModal({
    isOpen,
    address,
    privateKey,
    onClose,
    mode = 'created'
}: PrivateKeyModalProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(privateKey);
        setCopied(true);
        toast.success('Private key copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const data = JSON.stringify(
            {
                address,
                privateKey,
                createdAt: new Date().toISOString(),
                note: "KEEP THIS SAFE. DO NOT SHARE."
            },
            null,
            2
        );

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-wallet-${address.slice(0, 8)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Key file downloaded');
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {mode === 'created' ? (
                            <>
                                <CheckCircle2 className="h-5 w-5 text-success" />
                                Wallet Secured Successfully
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="h-5 w-5 text-warning" />
                                Private Key Revealed
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'created'
                            ? "Your agent wallet can perform actions on behalf of your account without having withdrawal permissions. You must still use your account's address to withdraw"
                            : "Be careful! Anyone with this key can access your funds."
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Wallet Address</Label>
                        <div className="text-sm font-mono bg-muted p-2 rounded break-all">
                            {address}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Private Key</Label>
                        <div className="relative">
                            <Input
                                value={privateKey}
                                readOnly
                                className="font-mono pr-10 text-xs"
                                type="text"
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Do not share this key with anyone.
                        </p>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <Button onClick={handleCopy} className="flex-1" variant="outline">
                            {copied ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                            {copied ? 'Copied' : 'Copy Key'}
                        </Button>
                        <Button onClick={handleDownload} className="flex-1" variant="outline">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </Button>
                    </div>

                    <Button onClick={onClose} className="w-full mt-2">
                        I have saved my key
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
