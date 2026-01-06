import React from 'react';
import { Lock, Printer } from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Dialog, DialogContent } from '../ui/dialog';
import { Drawer, DrawerContent } from '../ui/drawer';

interface ConsentModalLayoutProps {
  open: boolean;
  onContinue: () => void;
  onCancel: () => void;
  isValid: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}

export const ConsentModalLayout = React.memo(
  ({
    open,
    onContinue,
    onCancel,
    isValid,
    isMobile,
    children,
  }: ConsentModalLayoutProps) => {
    const handlePrint = () => {
      window.print();
    };

    const content = (
      <div
        className={`flex flex-col h-full overflow-hidden ${isMobile ? 'pb-16' : ''}`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Consent Required
              </h1>
              <p className="text-xs text-muted-foreground">
                Please review and accept to continue
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            className="hidden sm:flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>

        {/* Tabs */}
        <Tabs
          defaultValue="consent"
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto shrink-0">
            <TabsTrigger
              value="consent"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Consent
            </TabsTrigger>
            <TabsTrigger
              value="terms"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Terms of Use
            </TabsTrigger>
            <TabsTrigger
              value="risk"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Risk Disclosure
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <div className="p-4 sm:p-6">{children}</div>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onContinue} disabled={!isValid}>
            Continue
          </Button>
        </div>
      </div>
    );

    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={() => {}}>
          <DrawerContent className="h-[95vh] p-0">{content}</DrawerContent>
        </Drawer>
      );
    }

    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-3xl h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {content}
        </DialogContent>
      </Dialog>
    );
  }
);

ConsentModalLayout.displayName = 'ConsentModalLayout';
