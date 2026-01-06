import { TabsContent } from '../ui/tabs';
import { ConsentModalLayout } from './ConsentModalLayout';
import { ConsentTabContent } from './ConsentTabContent';
import { TermsTabContent } from './TermsTabContent';
import { RiskTabContent } from './RiskTabContent';
import { useConsentValidation } from './useConsentValidation';
import { ConsentModalProps, ConsentPayload } from './types';

export function ConsentModal({
  open,
  onConsentAccepted,
  onConsentDeclined,
  userRegion,
  immediateAccess,
}: ConsentModalProps) {
  const validation = useConsentValidation({ userRegion, immediateAccess });

  const isMobile = window.innerWidth < 768;

  const handleContinue = () => {
    if (!validation.validation.isAllValid) {
      validation.setShowErrors(true);
      return;
    }

    const payload: ConsentPayload = {
      service: 'PillarX Algorithmic Insights',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ipAddress: null,
      userRegion,
      immediateAccess,
      knowledgeCheck: {
        q1: validation.q1Answer,
        q2: [],
        q3: validation.q3Answer,
      },
      finalConsentGiven: validation.finalConsentChecked,
      coolingOffWaiverGiven: validation.coolingOffWaiverChecked,
      uiContext: {
        deviceType: isMobile ? 'mobile' : 'desktop',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
    };

    onConsentAccepted(payload);
  };

  return (
    <ConsentModalLayout
      open={open}
      onContinue={handleContinue}
      onCancel={onConsentDeclined}
      isValid={validation.validation.isAllValid}
      isMobile={isMobile}
    >
      <TabsContent value="consent" className="mt-0">
        <ConsentTabContent
          q1Answer={validation.q1Answer}
          setQ1Answer={validation.setQ1Answer}
          q3Answer={validation.q3Answer}
          setQ3Answer={validation.setQ3Answer}
          finalConsentChecked={validation.finalConsentChecked}
          setFinalConsentChecked={validation.setFinalConsentChecked}
          coolingOffWaiverChecked={validation.coolingOffWaiverChecked}
          setCoolingOffWaiverChecked={validation.setCoolingOffWaiverChecked}
          showErrors={validation.showErrors}
          validation={validation.validation}
          needsCoolingOffWaiver={validation.needsCoolingOffWaiver}
        />
      </TabsContent>
      <TabsContent value="terms" className="mt-0">
        <TermsTabContent />
      </TabsContent>
      <TabsContent value="risk" className="mt-0">
        <RiskTabContent />
      </TabsContent>
    </ConsentModalLayout>
  );
}
