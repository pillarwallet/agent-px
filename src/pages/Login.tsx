/* eslint-disable @typescript-eslint/no-use-before-define */
import { animated, useTransition } from '@react-spring/web';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

import PillarXLogo from '../assets/images/pillarX_full_white.png';
import Button from '../components/Button';
import { useSendVerificationOtpMutation } from '../services/pillarXApiVerification';
import { useVerifyOtpCodeMutation } from '../services/pillarXApiVerificationCheck';
import {
  PHONE_OTP_PHONE_NUMBER_KEY,
  PHONE_OTP_VERIFICATION_SID_KEY,
  createPhoneOtpPrivateKeyVault,
  getPhoneOtpAddressFromPrivateKey,
  getPhoneOtpMinimumPasscodeLength,
  hasPhoneOtpEncryptedVault,
  markPhoneOtpAuthenticated,
  setUnlockedPhoneOtpPrivateKey,
  unlockPhoneOtpPrivateKey,
} from '../utils/phoneOtpAuth';

const OTP_LENGTH = 6;

type JsonObject = Record<string, unknown>;
type LoginStep = 'phone' | 'otp' | 'createPasscode' | 'unlockPasscode';

type CountryCodeOption = {
  code: string;
  label: string;
};

type MobileLengthRule = {
  min: number;
  max: number;
};

const COUNTRY_CODE_OPTIONS: CountryCodeOption[] = [
  { code: '+1', label: 'United States (+1)' },
  { code: '+1', label: 'Canada (+1)' },
  { code: '+7', label: 'Kazakhstan (+7)' },
  { code: '+20', label: 'Egypt (+20)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+30', label: 'Greece (+30)' },
  { code: '+31', label: 'Netherlands (+31)' },
  { code: '+32', label: 'Belgium (+32)' },
  { code: '+33', label: 'France (+33)' },
  { code: '+34', label: 'Spain (+34)' },
  { code: '+36', label: 'Hungary (+36)' },
  { code: '+39', label: 'Italy (+39)' },
  { code: '+40', label: 'Romania (+40)' },
  { code: '+41', label: 'Switzerland (+41)' },
  { code: '+43', label: 'Austria (+43)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+45', label: 'Denmark (+45)' },
  { code: '+46', label: 'Sweden (+46)' },
  { code: '+47', label: 'Norway (+47)' },
  { code: '+48', label: 'Poland (+48)' },
  { code: '+49', label: 'Germany (+49)' },
  { code: '+51', label: 'Peru (+51)' },
  { code: '+52', label: 'Mexico (+52)' },
  { code: '+54', label: 'Argentina (+54)' },
  { code: '+55', label: 'Brazil (+55)' },
  { code: '+56', label: 'Chile (+56)' },
  { code: '+57', label: 'Colombia (+57)' },
  { code: '+60', label: 'Malaysia (+60)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+62', label: 'Indonesia (+62)' },
  { code: '+63', label: 'Philippines (+63)' },
  { code: '+64', label: 'New Zealand (+64)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+66', label: 'Thailand (+66)' },
  { code: '+81', label: 'Japan (+81)' },
  { code: '+82', label: 'South Korea (+82)' },
  { code: '+84', label: 'Vietnam (+84)' },
  { code: '+86', label: 'China (+86)' },
  { code: '+90', label: 'Turkey (+90)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+92', label: 'Pakistan (+92)' },
  { code: '+93', label: 'Afghanistan (+93)' },
  { code: '+94', label: 'Sri Lanka (+94)' },
  { code: '+95', label: 'Myanmar (+95)' },
  { code: '+98', label: 'Iran (+98)' },
  { code: '+212', label: 'Morocco (+212)' },
  { code: '+216', label: 'Tunisia (+216)' },
  { code: '+218', label: 'Libya (+218)' },
  { code: '+220', label: 'Gambia (+220)' },
  { code: '+221', label: 'Senegal (+221)' },
  { code: '+233', label: 'Ghana (+233)' },
  { code: '+234', label: 'Nigeria (+234)' },
  { code: '+251', label: 'Ethiopia (+251)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+255', label: 'Tanzania (+255)' },
  { code: '+256', label: 'Uganda (+256)' },
  { code: '+260', label: 'Zambia (+260)' },
  { code: '+263', label: 'Zimbabwe (+263)' },
  { code: '+351', label: 'Portugal (+351)' },
  { code: '+352', label: 'Luxembourg (+352)' },
  { code: '+353', label: 'Ireland (+353)' },
  { code: '+354', label: 'Iceland (+354)' },
  { code: '+358', label: 'Finland (+358)' },
  { code: '+380', label: 'Ukraine (+380)' },
  { code: '+385', label: 'Croatia (+385)' },
  { code: '+420', label: 'Czech Republic (+420)' },
  { code: '+421', label: 'Slovakia (+421)' },
  { code: '+852', label: 'Hong Kong (+852)' },
  { code: '+886', label: 'Taiwan (+886)' },
  { code: '+971', label: 'United Arab Emirates (+971)' },
  { code: '+972', label: 'Israel (+972)' },
  { code: '+973', label: 'Bahrain (+973)' },
  { code: '+974', label: 'Qatar (+974)' },
  { code: '+975', label: 'Bhutan (+975)' },
  { code: '+976', label: 'Mongolia (+976)' },
  { code: '+977', label: 'Nepal (+977)' },
  { code: '+992', label: 'Tajikistan (+992)' },
  { code: '+993', label: 'Turkmenistan (+993)' },
  { code: '+994', label: 'Azerbaijan (+994)' },
  { code: '+995', label: 'Georgia (+995)' },
  { code: '+996', label: 'Kyrgyzstan (+996)' },
  { code: '+998', label: 'Uzbekistan (+998)' },
];

const COUNTRY_FLAG_BY_CODE: Record<string, string> = {
  '+1': '🇺🇸',
  '+7': '🇰🇿',
  '+20': '🇪🇬',
  '+27': '🇿🇦',
  '+30': '🇬🇷',
  '+31': '🇳🇱',
  '+32': '🇧🇪',
  '+33': '🇫🇷',
  '+34': '🇪🇸',
  '+36': '🇭🇺',
  '+39': '🇮🇹',
  '+40': '🇷🇴',
  '+41': '🇨🇭',
  '+43': '🇦🇹',
  '+44': '🇬🇧',
  '+45': '🇩🇰',
  '+46': '🇸🇪',
  '+47': '🇳🇴',
  '+48': '🇵🇱',
  '+49': '🇩🇪',
  '+51': '🇵🇪',
  '+52': '🇲🇽',
  '+54': '🇦🇷',
  '+55': '🇧🇷',
  '+56': '🇨🇱',
  '+57': '🇨🇴',
  '+60': '🇲🇾',
  '+61': '🇦🇺',
  '+62': '🇮🇩',
  '+63': '🇵🇭',
  '+64': '🇳🇿',
  '+65': '🇸🇬',
  '+66': '🇹🇭',
  '+81': '🇯🇵',
  '+82': '🇰🇷',
  '+84': '🇻🇳',
  '+86': '🇨🇳',
  '+90': '🇹🇷',
  '+91': '🇮🇳',
  '+92': '🇵🇰',
  '+93': '🇦🇫',
  '+94': '🇱🇰',
  '+95': '🇲🇲',
  '+98': '🇮🇷',
  '+212': '🇲🇦',
  '+216': '🇹🇳',
  '+218': '🇱🇾',
  '+220': '🇬🇲',
  '+221': '🇸🇳',
  '+233': '🇬🇭',
  '+234': '🇳🇬',
  '+251': '🇪🇹',
  '+254': '🇰🇪',
  '+255': '🇹🇿',
  '+256': '🇺🇬',
  '+260': '🇿🇲',
  '+263': '🇿🇼',
  '+351': '🇵🇹',
  '+352': '🇱🇺',
  '+353': '🇮🇪',
  '+354': '🇮🇸',
  '+358': '🇫🇮',
  '+380': '🇺🇦',
  '+385': '🇭🇷',
  '+420': '🇨🇿',
  '+421': '🇸🇰',
  '+852': '🇭🇰',
  '+886': '🇹🇼',
  '+971': '🇦🇪',
  '+972': '🇮🇱',
  '+973': '🇧🇭',
  '+974': '🇶🇦',
  '+975': '🇧🇹',
  '+976': '🇲🇳',
  '+977': '🇳🇵',
  '+992': '🇹🇯',
  '+993': '🇹🇲',
  '+994': '🇦🇿',
  '+995': '🇬🇪',
  '+996': '🇰🇬',
  '+998': '🇺🇿',
};

const COUNTRY_MOBILE_LENGTH_RULES: Record<string, MobileLengthRule> = {
  '+1': { min: 10, max: 10 },
  '+7': { min: 10, max: 10 },
  '+20': { min: 10, max: 10 },
  '+27': { min: 9, max: 9 },
  '+30': { min: 10, max: 10 },
  '+31': { min: 9, max: 9 },
  '+32': { min: 8, max: 9 },
  '+33': { min: 9, max: 9 },
  '+34': { min: 9, max: 9 },
  '+36': { min: 9, max: 9 },
  '+39': { min: 9, max: 10 },
  '+40': { min: 9, max: 9 },
  '+41': { min: 9, max: 9 },
  '+43': { min: 10, max: 13 },
  '+44': { min: 10, max: 10 },
  '+45': { min: 8, max: 8 },
  '+46': { min: 7, max: 10 },
  '+47': { min: 8, max: 8 },
  '+48': { min: 9, max: 9 },
  '+49': { min: 10, max: 11 },
  '+51': { min: 9, max: 9 },
  '+52': { min: 10, max: 10 },
  '+54': { min: 10, max: 10 },
  '+55': { min: 10, max: 11 },
  '+56': { min: 9, max: 9 },
  '+57': { min: 10, max: 10 },
  '+60': { min: 9, max: 10 },
  '+61': { min: 9, max: 9 },
  '+62': { min: 9, max: 12 },
  '+63': { min: 10, max: 10 },
  '+64': { min: 8, max: 10 },
  '+65': { min: 8, max: 8 },
  '+66': { min: 9, max: 9 },
  '+81': { min: 10, max: 10 },
  '+82': { min: 9, max: 10 },
  '+84': { min: 9, max: 10 },
  '+86': { min: 11, max: 11 },
  '+90': { min: 10, max: 10 },
  '+91': { min: 10, max: 10 },
  '+92': { min: 10, max: 10 },
  '+93': { min: 9, max: 9 },
  '+94': { min: 9, max: 9 },
  '+95': { min: 7, max: 10 },
  '+98': { min: 10, max: 10 },
  '+212': { min: 9, max: 9 },
  '+216': { min: 8, max: 8 },
  '+218': { min: 9, max: 9 },
  '+220': { min: 7, max: 7 },
  '+221': { min: 9, max: 9 },
  '+233': { min: 9, max: 9 },
  '+234': { min: 10, max: 10 },
  '+251': { min: 9, max: 9 },
  '+254': { min: 9, max: 9 },
  '+255': { min: 9, max: 9 },
  '+256': { min: 9, max: 9 },
  '+260': { min: 9, max: 9 },
  '+263': { min: 9, max: 9 },
  '+351': { min: 9, max: 9 },
  '+352': { min: 9, max: 9 },
  '+353': { min: 9, max: 9 },
  '+354': { min: 7, max: 7 },
  '+358': { min: 9, max: 10 },
  '+380': { min: 9, max: 9 },
  '+385': { min: 8, max: 9 },
  '+420': { min: 9, max: 9 },
  '+421': { min: 9, max: 9 },
  '+852': { min: 8, max: 8 },
  '+886': { min: 9, max: 9 },
  '+971': { min: 9, max: 9 },
  '+972': { min: 9, max: 9 },
  '+973': { min: 8, max: 8 },
  '+974': { min: 8, max: 8 },
  '+975': { min: 8, max: 8 },
  '+976': { min: 8, max: 8 },
  '+977': { min: 10, max: 10 },
  '+992': { min: 9, max: 9 },
  '+993': { min: 8, max: 8 },
  '+994': { min: 9, max: 9 },
  '+995': { min: 9, max: 9 },
  '+996': { min: 9, max: 9 },
  '+998': { min: 9, max: 9 },
};

const DEFAULT_MOBILE_LENGTH_RULE: MobileLengthRule = {
  min: 6,
  max: 14,
};

const createEmptyOtpDigits = () => Array.from({ length: OTP_LENGTH }, () => '');

const isValidPhoneNumber = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);

const getErrorMessage = (
  payload: JsonObject | undefined,
  fallback: string
): string => {
  if (!payload) return fallback;

  const messageCandidates = [
    payload.message,
    payload.error,
    payload.detail,
    payload.description,
  ];

  const matchedMessage = messageCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0
  );

  return matchedMessage ?? fallback;
};

const getMutationErrorPayload = (error: unknown): JsonObject | undefined => {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return undefined;
  }

  const mutationErrorData = (error as { data?: unknown }).data;
  if (typeof mutationErrorData === 'object' && mutationErrorData !== null) {
    return mutationErrorData as JsonObject;
  }

  return undefined;
};

const getMutationErrorMessage = (error: unknown, fallback: string): string => {
  const errorPayload = getMutationErrorPayload(error);
  if (errorPayload) {
    return getErrorMessage(errorPayload, fallback);
  }

  if (typeof error === 'object' && error !== null) {
    const errorAsObject = error as { error?: unknown; message?: unknown };

    if (
      typeof errorAsObject.error === 'string' &&
      errorAsObject.error.trim().length > 0
    ) {
      return errorAsObject.error;
    }

    if (
      typeof errorAsObject.message === 'string' &&
      errorAsObject.message.trim().length > 0
    ) {
      return errorAsObject.message;
    }
  }

  return fallback;
};

const extractVerificationSid = (
  payload: JsonObject | undefined
): string | undefined => {
  if (!payload) return undefined;

  const resultObject =
    typeof payload.result === 'object' && payload.result
      ? (payload.result as JsonObject)
      : undefined;

  const dataObject =
    typeof payload.data === 'object' && payload.data
      ? (payload.data as JsonObject)
      : undefined;

  const candidates = [
    payload.verificationSid,
    payload.verificationSID,
    payload.sid,
    resultObject?.verificationSid,
    resultObject?.sid,
    dataObject?.verificationSid,
    dataObject?.sid,
  ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0
  );
};

const isVerificationApproved = (payload: JsonObject | undefined) => {
  if (!payload) return true;

  if (typeof payload.valid === 'boolean') {
    return payload.valid;
  }

  if (typeof payload.status === 'string') {
    const normalizedStatus = payload.status.toLowerCase();
    return (
      normalizedStatus === 'approved' ||
      normalizedStatus === 'success' ||
      normalizedStatus === 'verified'
    );
  }

  return true;
};

const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [verificationSid, setVerificationSid] = useState<string | undefined>(
    undefined
  );
  const [otpDigits, setOtpDigits] = useState<string[]>(createEmptyOtpDigits);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isProcessingPasscode, setIsProcessingPasscode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState<string | null>(
    null
  );
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');

  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lastSubmittedOtp = useRef<string | null>(null);
  const [sendVerificationOtp] = useSendVerificationOtpMutation();
  const [verifyOtpCode] = useVerifyOtpCodeMutation();

  const normalizedMobileNumber = useMemo(
    () => mobileNumber.replace(/\D/g, ''),
    [mobileNumber]
  );

  const fullPhoneNumber = useMemo(
    () => `${countryCode}${normalizedMobileNumber}`,
    [countryCode, normalizedMobileNumber]
  );

  const selectedMobileLengthRule = useMemo(
    () =>
      COUNTRY_MOBILE_LENGTH_RULES[countryCode] ?? DEFAULT_MOBILE_LENGTH_RULE,
    [countryCode]
  );

  const hasValidPhoneNumber = useMemo(() => {
    const mobileLength = normalizedMobileNumber.length;
    const isLengthValid =
      mobileLength >= selectedMobileLengthRule.min &&
      mobileLength <= selectedMobileLengthRule.max;

    return isLengthValid && isValidPhoneNumber(fullPhoneNumber);
  }, [fullPhoneNumber, normalizedMobileNumber, selectedMobileLengthRule]);

  const selectedCountryFlag = useMemo(
    () => COUNTRY_FLAG_BY_CODE[countryCode] ?? '🌐',
    [countryCode]
  );

  const otpCode = useMemo(() => otpDigits.join(''), [otpDigits]);
  const isOtpComplete = useMemo(
    () => otpDigits.every((digit) => digit.length === 1),
    [otpDigits]
  );

  const minimumPasscodeLength = getPhoneOtpMinimumPasscodeLength();
  const isAnyAuthActionInProgress =
    isSendingOtp || isVerifyingOtp || isProcessingPasscode;

  const logoTransitions = useTransition(true, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: 500 },
  });

  useEffect(() => {
    localStorage.removeItem(PHONE_OTP_VERIFICATION_SID_KEY);

    const hasVault = hasPhoneOtpEncryptedVault();
    const storedPhoneNumber = localStorage.getItem(PHONE_OTP_PHONE_NUMBER_KEY);

    if (!hasVault) return;

    setStep('unlockPasscode');
    setVerifiedPhoneNumber(storedPhoneNumber);
    setErrorMessage(null);
    setInfoMessage('Enter your passcode to unlock wallet.');
  }, []);

  useEffect(() => {
    let focusTimeout: number | undefined;

    if (step === 'otp') {
      focusTimeout = window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 40);
    }

    return () => {
      if (focusTimeout !== undefined) {
        window.clearTimeout(focusTimeout);
      }
    };
  }, [step]);

  const sendOtp = async ({ moveToOtpScreen }: { moveToOtpScreen: boolean }) => {
    if (!hasValidPhoneNumber) {
      setErrorMessage(`Enter a valid mobile number for ${countryCode}.`);
      setInfoMessage(null);
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsSendingOtp(true);

    try {
      const payload = (await sendVerificationOtp({
        to: fullPhoneNumber,
        channel: 'sms',
      }).unwrap()) as JsonObject;

      const receivedVerificationSid = extractVerificationSid(payload);
      if (!receivedVerificationSid) {
        throw new Error(
          'verificationSid is missing in response. Unable to continue OTP login.'
        );
      }

      setVerificationSid(receivedVerificationSid);
      localStorage.setItem(
        PHONE_OTP_VERIFICATION_SID_KEY,
        receivedVerificationSid
      );

      setInfoMessage('OTP sent. Enter the 6-digit code.');

      if (moveToOtpScreen) {
        setStep('otp');
        setOtpDigits(createEmptyOtpDigits());
        lastSubmittedOtp.current = null;
      }
    } catch (error) {
      setErrorMessage(
        getMutationErrorMessage(error, 'Failed to send OTP. Please try again.')
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const completeAuthenticatedLogin = (
    privateKey: `0x${string}`,
    authenticatedPhoneNumber: string
  ) => {
    const accountAddress = getPhoneOtpAddressFromPrivateKey(privateKey);

    setUnlockedPhoneOtpPrivateKey(privateKey);
    markPhoneOtpAuthenticated(authenticatedPhoneNumber);
    localStorage.setItem('EOA_ADDRESS', accountAddress);
    localStorage.removeItem(PHONE_OTP_VERIFICATION_SID_KEY);
    sessionStorage.setItem('loginPageReloaded', 'false');

    navigate('/', { replace: true });
  };

  const verifyOtp = useCallback(
    async (codeToVerify: string) => {
      if (!verificationSid) {
        setErrorMessage('OTP session expired. Please request a new OTP.');
        setInfoMessage(null);
        return;
      }

      setErrorMessage(null);
      setInfoMessage('Verifying OTP...');
      setIsVerifyingOtp(true);

      try {
        const payload = (await verifyOtpCode({
          to: fullPhoneNumber,
          code: codeToVerify,
          verificationSid,
        }).unwrap()) as JsonObject;

        if (!isVerificationApproved(payload)) {
          throw new Error(
            getErrorMessage(payload, 'OTP is invalid or expired. Please retry.')
          );
        }

        setVerifiedPhoneNumber(fullPhoneNumber);
        setVerificationSid(undefined);
        localStorage.removeItem(PHONE_OTP_VERIFICATION_SID_KEY);

        const hasVault = hasPhoneOtpEncryptedVault();

        setPasscode('');
        setConfirmPasscode('');
        setStep(hasVault ? 'unlockPasscode' : 'createPasscode');
        setInfoMessage(
          hasVault
            ? 'OTP verified. Enter your passcode to unlock wallet.'
            : `OTP verified. Create a wallet passcode (${minimumPasscodeLength}+ characters).`
        );
      } catch (error) {
        setErrorMessage(
          getMutationErrorMessage(
            error,
            'OTP verification failed. Please try again.'
          )
        );
        setInfoMessage('Enter the OTP again.');
        setOtpDigits(createEmptyOtpDigits());
        lastSubmittedOtp.current = null;

        window.setTimeout(() => {
          otpInputRefs.current[0]?.focus();
        }, 40);
      } finally {
        setIsVerifyingOtp(false);
      }
    },
    [fullPhoneNumber, minimumPasscodeLength, verificationSid, verifyOtpCode]
  );

  const handleCreatePasscode = async () => {
    if (!verifiedPhoneNumber) {
      setErrorMessage('Phone verification expired. Please verify OTP again.');
      return;
    }

    if (passcode.trim().length < minimumPasscodeLength) {
      setErrorMessage(
        `Passcode must be at least ${minimumPasscodeLength} characters.`
      );
      return;
    }

    if (passcode !== confirmPasscode) {
      setErrorMessage('Passcode and confirmation do not match.');
      return;
    }

    setErrorMessage(null);
    setInfoMessage('Creating encrypted wallet vault...');
    setIsProcessingPasscode(true);

    try {
      const privateKey = await createPhoneOtpPrivateKeyVault(passcode);
      completeAuthenticatedLogin(privateKey, verifiedPhoneNumber);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to create wallet vault. Please try again.'
      );
    } finally {
      setIsProcessingPasscode(false);
    }
  };

  const handleUnlockPasscode = async () => {
    const storedPhoneNumber = localStorage.getItem(PHONE_OTP_PHONE_NUMBER_KEY);
    const authenticatedPhoneNumber = verifiedPhoneNumber ?? storedPhoneNumber;

    if (!authenticatedPhoneNumber) {
      setErrorMessage(
        'Could not find a linked phone number. Please verify OTP once to continue.'
      );
      setInfoMessage(null);
      setStep('phone');
      return;
    }

    if (passcode.trim().length < minimumPasscodeLength) {
      setErrorMessage(
        `Passcode must be at least ${minimumPasscodeLength} characters.`
      );
      return;
    }

    setErrorMessage(null);
    setInfoMessage('Unlocking wallet...');
    setIsProcessingPasscode(true);

    try {
      const privateKey = await unlockPhoneOtpPrivateKey(passcode);
      completeAuthenticatedLogin(privateKey, authenticatedPhoneNumber);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to unlock wallet. Please try again.'
      );
    } finally {
      setIsProcessingPasscode(false);
    }
  };

  useEffect(() => {
    if (step !== 'otp') return;
    if (!verificationSid) return;
    if (!isOtpComplete) return;
    if (isVerifyingOtp) return;
    if (lastSubmittedOtp.current === otpCode) return;

    lastSubmittedOtp.current = otpCode;
    verifyOtp(otpCode);
  }, [
    step,
    verificationSid,
    isOtpComplete,
    isVerifyingOtp,
    otpCode,
    verifyOtp,
  ]);

  const handleMobileNumberChange = (value: string) => {
    setMobileNumber(
      value.replace(/\D/g, '').slice(0, selectedMobileLengthRule.max)
    );
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleCountryCodeChange = (value: string) => {
    const nextRule =
      COUNTRY_MOBILE_LENGTH_RULES[value] ?? DEFAULT_MOBILE_LENGTH_RULE;

    setCountryCode(value);
    setMobileNumber((previousNumber) => previousNumber.slice(0, nextRule.max));
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleEditPhoneNumber = () => {
    setStep('phone');
    setVerificationSid(undefined);
    setVerifiedPhoneNumber(null);
    setPasscode('');
    setConfirmPasscode('');
    localStorage.removeItem(PHONE_OTP_VERIFICATION_SID_KEY);
    setOtpDigits(createEmptyOtpDigits());
    lastSubmittedOtp.current = null;
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleOtpInputChange = (index: number, rawValue: string) => {
    if (isVerifyingOtp) return;

    const digitsOnly = rawValue.replace(/\D/g, '');
    setErrorMessage(null);
    setInfoMessage(null);
    lastSubmittedOtp.current = null;

    if (!digitsOnly) {
      setOtpDigits((previousDigits) => {
        const nextDigits = [...previousDigits];
        nextDigits[index] = '';
        return nextDigits;
      });
      return;
    }

    setOtpDigits((previousDigits) => {
      const nextDigits = [...previousDigits];
      const digitsToApply = digitsOnly.slice(0, OTP_LENGTH - index).split('');

      digitsToApply.forEach((digit, offset) => {
        nextDigits[index + offset] = digit;
      });

      return nextDigits;
    });

    if (digitsOnly.length === 1) {
      if (index < OTP_LENGTH - 1) {
        otpInputRefs.current[index + 1]?.focus();
      }
      return;
    }

    const nextFocusIndex = Math.min(index + digitsOnly.length, OTP_LENGTH - 1);
    otpInputRefs.current[nextFocusIndex]?.focus();
  };

  const handleOtpPaste = (
    index: number,
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    event.preventDefault();

    const pastedDigits = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH - index);

    if (!pastedDigits) return;

    setErrorMessage(null);
    setInfoMessage(null);
    lastSubmittedOtp.current = null;

    setOtpDigits((previousDigits) => {
      const nextDigits = [...previousDigits];
      pastedDigits.split('').forEach((digit, offset) => {
        nextDigits[index + offset] = digit;
      });
      return nextDigits;
    });

    const nextFocusIndex = Math.min(
      index + pastedDigits.length,
      OTP_LENGTH - 1
    );
    otpInputRefs.current[nextFocusIndex]?.focus();
  };

  const handleOtpKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      setErrorMessage(null);
      setInfoMessage(null);
      lastSubmittedOtp.current = null;

      setOtpDigits((previousDigits) => {
        const nextDigits = [...previousDigits];

        if (nextDigits[index]) {
          nextDigits[index] = '';
          return nextDigits;
        }

        if (index > 0) {
          nextDigits[index - 1] = '';
          otpInputRefs.current[index - 1]?.focus();
        }

        return nextDigits;
      });
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
    }
  };

  return (
    <Wrapper>
      {logoTransitions(
        (styles, item) =>
          item && (
            <animated.img
              src={PillarXLogo}
              alt="pillar-x-logo"
              className="max-w-[300px] h-auto"
              style={styles}
            />
          )
      )}

      <FormCard>
        {step === 'phone' && (
          <>
            <PhoneInputRow>
              <CountryCodeField>
                <CountryCodeDisplay>
                  <CountryFlag>{selectedCountryFlag}</CountryFlag>
                  <CountryCodeText>{countryCode}</CountryCodeText>
                </CountryCodeDisplay>
                <CountryCodeSelect
                  value={countryCode}
                  onChange={(event) =>
                    handleCountryCodeChange(event.target.value)
                  }
                  disabled={isSendingOtp || isVerifyingOtp}
                >
                  {COUNTRY_CODE_OPTIONS.map((option) => (
                    <option
                      key={`${option.label}-${option.code}`}
                      value={option.code}
                    >
                      {option.label}
                    </option>
                  ))}
                </CountryCodeSelect>
              </CountryCodeField>

              <MobileNumberInput
                type="tel"
                value={mobileNumber}
                onChange={(event) =>
                  handleMobileNumberChange(event.target.value)
                }
                placeholder="Mobile number"
                autoComplete="tel-national"
                inputMode="numeric"
                disabled={isSendingOtp || isVerifyingOtp}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    sendOtp({ moveToOtpScreen: true });
                  }
                }}
              />
            </PhoneInputRow>

            <Button
              onClick={() => {
                sendOtp({ moveToOtpScreen: true });
              }}
              $fullWidth
              $last
              disabled={isSendingOtp || isVerifyingOtp || !hasValidPhoneNumber}
            >
              {isSendingOtp ? 'Sending OTP...' : 'Send OTP'}
            </Button>
          </>
        )}

        {step === 'otp' && (
          <>
            <TopActions>
              <TextActionButton
                type="button"
                onClick={handleEditPhoneNumber}
                disabled={isSendingOtp || isVerifyingOtp}
              >
                Edit phone number
              </TextActionButton>
              <TextActionButton
                type="button"
                onClick={() => {
                  sendOtp({ moveToOtpScreen: false });
                }}
                disabled={isSendingOtp || isVerifyingOtp}
              >
                {isSendingOtp ? 'Resending...' : 'Resend OTP'}
              </TextActionButton>
            </TopActions>

            <SectionHeading>Enter verification code</SectionHeading>
            <SectionDescription>
              Code sent to {fullPhoneNumber}
            </SectionDescription>

            <OtpInputRow>
              {otpDigits.map((digit, index) => (
                <OtpInput
                  key={`otp-input-${index}`}
                  ref={(element) => {
                    otpInputRefs.current[index] = element;
                  }}
                  type="text"
                  value={digit}
                  maxLength={OTP_LENGTH}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onChange={(event) =>
                    handleOtpInputChange(index, event.target.value)
                  }
                  onPaste={(event) => handleOtpPaste(index, event)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  disabled={isVerifyingOtp}
                  $hasError={!!errorMessage}
                />
              ))}
            </OtpInputRow>
          </>
        )}

        {step === 'createPasscode' && (
          <>
            <TopActions>
              <TextActionButton
                type="button"
                onClick={handleEditPhoneNumber}
                disabled={isAnyAuthActionInProgress}
              >
                Use another number
              </TextActionButton>
            </TopActions>

            <SectionHeading>Secure your wallet</SectionHeading>
            <SectionDescription>
              Create a passcode to encrypt your wallet key on this device.
            </SectionDescription>

            <SecureInput
              type="password"
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value);
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              placeholder="Create passcode"
              autoComplete="new-password"
              disabled={isAnyAuthActionInProgress}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleCreatePasscode();
                }
              }}
            />

            <SecureInput
              type="password"
              value={confirmPasscode}
              onChange={(event) => {
                setConfirmPasscode(event.target.value);
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              placeholder="Confirm passcode"
              autoComplete="new-password"
              disabled={isAnyAuthActionInProgress}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleCreatePasscode();
                }
              }}
            />

            <Button
              onClick={() => {
                handleCreatePasscode();
              }}
              $fullWidth
              $last
              disabled={
                isAnyAuthActionInProgress ||
                passcode.length === 0 ||
                confirmPasscode.length === 0
              }
            >
              {isProcessingPasscode ? 'Creating Wallet...' : 'Create Wallet'}
            </Button>
          </>
        )}

        {step === 'unlockPasscode' && (
          <>
            <TopActions>
              <TextActionButton
                type="button"
                onClick={handleEditPhoneNumber}
                disabled={isAnyAuthActionInProgress}
              >
                Use another number
              </TextActionButton>
            </TopActions>

            <SectionHeading>Unlock wallet</SectionHeading>
            <SectionDescription>
              {verifiedPhoneNumber
                ? `Verified ${verifiedPhoneNumber}. Enter your passcode.`
                : 'Enter your passcode to unlock your wallet.'}
            </SectionDescription>

            <SecureInput
              type="password"
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value);
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              placeholder="Enter passcode"
              autoComplete="current-password"
              disabled={isAnyAuthActionInProgress}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleUnlockPasscode();
                }
              }}
            />

            <Button
              onClick={() => {
                handleUnlockPasscode();
              }}
              $fullWidth
              $last
              disabled={isAnyAuthActionInProgress || passcode.length === 0}
            >
              {isProcessingPasscode ? 'Unlocking...' : 'Unlock Wallet'}
            </Button>
          </>
        )}

        {infoMessage && !errorMessage && <Message>{infoMessage}</Message>}
        {errorMessage && <Message $error>{errorMessage}</Message>}
      </FormCard>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  min-height: 100vh;
  padding: 50px 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  max-width: 500px;
  margin: 0 auto;
`;

const FormCard = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-top: 40px;
  gap: 14px;
`;

const SectionHeading = styled.h2`
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text.body};
`;

const SectionDescription = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.text.inputInactive};
`;

const PhoneInputRow = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
  gap: 10px;
`;

const CountryCodeField = styled.div`
  position: relative;
  height: 46px;
  border: 1px solid ${({ theme }) => theme.color.border.buttonSecondary};
  border-radius: 6px;
  background: ${({ theme }) => theme.color.background.input};
  display: flex;
  align-items: center;
  justify-content: center;

  &:focus-within {
    border-color: ${({ theme }) => theme.color.background.buttonPrimary};
  }
`;

const CountryCodeDisplay = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
`;

const CountryFlag = styled.span`
  font-size: 18px;
  line-height: 1;
`;

const CountryCodeText = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.text.input};
`;

const CountryCodeSelect = styled.select`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
`;

const MobileNumberInput = styled.input`
  height: 46px;
  width: 100%;
  border: 1px solid ${({ theme }) => theme.color.border.buttonSecondary};
  border-radius: 6px;
  background: ${({ theme }) => theme.color.background.input};
  color: ${({ theme }) => theme.color.text.input};
  padding: 0 14px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.background.buttonPrimary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.text.inputInactive};
  }
`;

const SecureInput = styled(MobileNumberInput)`
  letter-spacing: 0.02em;
`;

const TopActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
`;

const TextActionButton = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text.cardLink};
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const OtpInputRow = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
`;

const OtpInput = styled.input<{ $hasError?: boolean }>`
  height: 52px;
  width: 100%;
  border: 1px solid
    ${({ theme, $hasError }) =>
      $hasError
        ? theme.color.text.transactionStatus.failed
        : theme.color.border.buttonSecondary};
  border-radius: 8px;
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  background: ${({ theme }) => theme.color.background.input};
  color: ${({ theme }) => theme.color.text.input};

  &:focus {
    outline: none;
    border-color: ${({ theme, $hasError }) =>
      $hasError
        ? theme.color.text.transactionStatus.failed
        : theme.color.background.buttonPrimary};
    background: ${({ theme }) => theme.color.background.inputActive};
  }
`;

const Message = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: ${({ theme, $error }) =>
    $error ? theme.color.text.transactionStatus.failed : theme.color.text.body};
`;

export default Login;
