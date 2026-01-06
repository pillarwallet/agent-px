import React from 'react';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { AlertCircle } from 'lucide-react';
import { ValidationState } from './types';

interface ConsentTabContentProps {
  q1Answer: string | null;
  setQ1Answer: (val: string) => void;
  q3Answer: string | null;
  setQ3Answer: (val: string) => void;
  finalConsentChecked: boolean;
  setFinalConsentChecked: (val: boolean) => void;
  coolingOffWaiverChecked: boolean;
  setCoolingOffWaiverChecked: (val: boolean) => void;
  showErrors: boolean;
  validation: ValidationState;
  needsCoolingOffWaiver: boolean;
}

export const ConsentTabContent = React.memo(
  ({
    q1Answer,
    setQ1Answer,
    q3Answer,
    setQ3Answer,
    finalConsentChecked,
    setFinalConsentChecked,
    coolingOffWaiverChecked,
    setCoolingOffWaiverChecked,
    showErrors,
    validation,
    needsCoolingOffWaiver,
  }: ConsentTabContentProps) => {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-foreground">
            PillarX Algorithmic Insights
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Before accessing the PillarX Algorithmic Insights service, you must
            acknowledge the following terms and confirm your understanding.
            Please review all tabs (Consent, Terms of Use, Risk Disclosure) and
            complete the questions below.
          </p>
        </div>

        {/* Service Overview */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">
            Service Overview
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            PillarX Algorithmic Insights is an{' '}
            <span className="font-medium text-foreground">
              informational event display service
            </span>
            . It does not execute trades, hold funds, or provide personalized
            financial advice. All events are generated algorithmically and
            presented for educational and informational purposes only.
          </p>
        </div>

        {/* Final Consent */}
        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="text-lg font-semibold text-foreground">
            Final Agreement
          </h3>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="final-consent"
              checked={finalConsentChecked}
              onCheckedChange={setFinalConsentChecked}
            />
            <Label
              htmlFor="final-consent"
              className="text-sm leading-relaxed cursor-pointer"
            >
              I have reviewed the Consent, Terms of Use, and Risk Disclosure
              tabs. I understand that this service is for informational purposes
              only and does not constitute financial advice. I agree to all
              terms and conditions and accept full responsibility for any
              trading decisions I make.
            </Label>
          </div>
          {showErrors && !validation.isFinalConsentValid && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              You must check this box to proceed.
            </p>
          )}

          {needsCoolingOffWaiver && (
            <div className="flex items-start space-x-3 mt-4 p-3 bg-muted/50 rounded-md border border-border">
              <Checkbox
                id="cooling-off-waiver"
                checked={coolingOffWaiverChecked}
                onCheckedChange={setCoolingOffWaiverChecked}
              />
              <Label
                htmlFor="cooling-off-waiver"
                className="text-sm leading-relaxed cursor-pointer"
              >
                <span className="font-semibold">
                  Cooling-Off Period Waiver (UK/EU):
                </span>{' '}
                I acknowledge my right to a 14-day cooling-off period. By
                requesting immediate access, I voluntarily waive this right and
                agree to begin using the service immediately.
              </Label>
            </div>
          )}
          {showErrors && !validation.isCoolingOffWaiverValid && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              You must waive the cooling-off period to request immediate access.
            </p>
          )}
        </div>

        {/* Knowledge Check */}
        <div className="space-y-6 border-t border-border pt-6">
          <h3 className="text-lg font-semibold text-foreground">
            Knowledge Check
          </h3>

          {/* Question 1 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">
              1. Do you understand that this service provides{' '}
              <span className="font-semibold">informational events only</span>{' '}
              and does not constitute financial advice?
            </Label>
            <RadioGroup value={q1Answer || ''} onValueChange={setQ1Answer}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="q1-yes" />
                <Label htmlFor="q1-yes" className="font-normal cursor-pointer">
                  Yes, I understand
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="q1-no" />
                <Label htmlFor="q1-no" className="font-normal cursor-pointer">
                  No, I do not understand
                </Label>
              </div>
            </RadioGroup>
            {showErrors && !validation.isQ1Valid && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                You must answer "Yes, I understand" to proceed.
              </p>
            )}
          </div>

          {/* Question 2 (renumbered from Q3) */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">
              2. Do you agree to use this service{' '}
              <span className="font-semibold">at your own risk</span> and
              acknowledge that you have read the Terms of Use and Risk
              Disclosure?
            </Label>
            <RadioGroup value={q3Answer || ''} onValueChange={setQ3Answer}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="agree" id="q3-agree" />
                <Label
                  htmlFor="q3-agree"
                  className="font-normal cursor-pointer"
                >
                  I agree
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="disagree" id="q3-disagree" />
                <Label
                  htmlFor="q3-disagree"
                  className="font-normal cursor-pointer"
                >
                  I do not agree
                </Label>
              </div>
            </RadioGroup>
            {showErrors && !validation.isQ3Valid && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                You must agree to proceed.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ConsentTabContent.displayName = 'ConsentTabContent';
