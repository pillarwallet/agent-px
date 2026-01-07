import { useState, useMemo } from "react";
import { ConsentState, ValidationState } from "./types";
import { CORRECT_Q2_ANSWERS } from "./constants";

interface UseConsentValidationProps {
  userRegion?: string;
  immediateAccess?: boolean;
}

export function useConsentValidation({ userRegion, immediateAccess }: UseConsentValidationProps) {
  const [q1Answer, setQ1Answer] = useState<string | null>(null);
  const [q3Answer, setQ3Answer] = useState<string | null>(null);
  const [finalConsentChecked, setFinalConsentChecked] = useState(false);
  const [coolingOffWaiverChecked, setCoolingOffWaiverChecked] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const needsCoolingOffWaiver = useMemo(() => {
    const region = userRegion?.toUpperCase();
    const isUKorEU = region === "UK" || region === "EU";
    return isUKorEU && immediateAccess === true;
  }, [userRegion, immediateAccess]);

  const validation: ValidationState = useMemo(() => {
    const isQ1Valid = q1Answer === "yes";
    const isQ3Valid = q3Answer === "agree";
    const isFinalConsentValid = finalConsentChecked;
    const isCoolingOffWaiverValid = needsCoolingOffWaiver ? coolingOffWaiverChecked : true;
    const isAllValid =
      isQ1Valid && isQ3Valid && isFinalConsentValid && isCoolingOffWaiverValid;

    return {
      isQ1Valid,
      isQ3Valid,
      isFinalConsentValid,
      isCoolingOffWaiverValid,
      isAllValid,
    };
  }, [q1Answer, q3Answer, finalConsentChecked, coolingOffWaiverChecked, needsCoolingOffWaiver]);

  return {
    q1Answer,
    setQ1Answer,
    q3Answer,
    setQ3Answer,
    finalConsentChecked,
    setFinalConsentChecked,
    coolingOffWaiverChecked,
    setCoolingOffWaiverChecked,
    showErrors,
    setShowErrors,
    validation,
    needsCoolingOffWaiver,
  };
}
