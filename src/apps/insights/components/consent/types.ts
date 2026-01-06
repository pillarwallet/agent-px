export interface ConsentPayload {
  service: string;
  timestamp: string;
  userAgent: string;
  ipAddress: string | null;
  userRegion?: string;
  immediateAccess?: boolean;
  knowledgeCheck: {
    q1: string | null;
    q2: string[];
    q3: string | null;
  };
  finalConsentGiven: boolean;
  coolingOffWaiverGiven: boolean;
  uiContext: {
    deviceType: 'mobile' | 'desktop';
    viewportWidth: number;
    viewportHeight: number;
  };
}

export interface ConsentModalProps {
  open: boolean;
  onConsentAccepted: (payload: ConsentPayload) => void;
  onConsentDeclined: () => void;
  userRegion?: string;
  immediateAccess?: boolean;
}

export interface ValidationState {
  isQ1Valid: boolean;
  isQ3Valid: boolean;
  isFinalConsentValid: boolean;
  isCoolingOffWaiverValid: boolean;
  isAllValid: boolean;
}

export interface ConsentState {
  q1Answer: string | null;
  q3Answer: string | null;
  finalConsentChecked: boolean;
  coolingOffWaiverChecked: boolean;
  showErrors: boolean;
}
