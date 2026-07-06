import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  getPillarKeyringStatus,
  lockPillarKeyring,
} from './pillarKeyringMessaging';
import {
  PHONE_OTP_AUTH_KEY,
  PHONE_OTP_PHONE_NUMBER_KEY,
  PHONE_OTP_COUNTRY_OPTION_LABEL_KEY,
  PHONE_OTP_VERIFICATION_SID_KEY,
  PHONE_OTP_PRIVATE_KEY,
  PHONE_OTP_ENCRYPTED_VAULT_KEY,
  PHONE_OTP_AUTH_STATE_EVENT,
} from './phoneOtpAuthKeys';

export {
  PHONE_OTP_AUTH_KEY,
  PHONE_OTP_PHONE_NUMBER_KEY,
  PHONE_OTP_COUNTRY_OPTION_LABEL_KEY,
  PHONE_OTP_VERIFICATION_SID_KEY,
  PHONE_OTP_PRIVATE_KEY,
  PHONE_OTP_ENCRYPTED_VAULT_KEY,
  PHONE_OTP_AUTH_STATE_EVENT,
} from './phoneOtpAuthKeys';

const VAULT_VERSION = 1;
const VAULT_KDF_ITERATIONS = 350_000;
const VAULT_SALT_LENGTH = 16;
const VAULT_IV_LENGTH = 12;
const MIN_VAULT_PASSPHRASE_LENGTH = 8;
const PHONE_OTP_UNLOCKED_ADDRESS_SESSION_KEY =
  'PILLARX_PHONE_OTP_UNLOCKED_ADDRESS_SESSION_V1';

type PhoneOtpVaultPayload = {
  version: number;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

type ChromeStorageAreaLike = {
  get: (
    keys: string | string[] | null,
    callback: (items: Record<string, unknown>) => void
  ) => void;
  remove?: (keys: string | string[], callback?: () => void) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
};

type ChromeLike = {
  storage?: {
    session?: ChromeStorageAreaLike;
  };
};

let unlockedPhoneOtpAddress: `0x${string}` | undefined;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const PBKDF2_KEY_USAGES: KeyUsage[] = ['deriveKey'];
const AES_GCM_KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

const isValidPrivateKey = (value: string): value is `0x${string}` =>
  /^0x[a-fA-F0-9]{64}$/.test(value);

const isValidAddress = (value: string): value is `0x${string}` =>
  /^0x[a-fA-F0-9]{40}$/.test(value);

const getChromeSessionStorage = () =>
  (globalThis as { chrome?: ChromeLike }).chrome?.storage?.session;

const getSessionAddressCache = (): Promise<`0x${string}` | undefined> =>
  new Promise((resolve) => {
    const storage = getChromeSessionStorage();
    if (!storage) {
      resolve(undefined);
      return;
    }

    try {
      storage.get([PHONE_OTP_UNLOCKED_ADDRESS_SESSION_KEY], (items) => {
        const address = items?.[PHONE_OTP_UNLOCKED_ADDRESS_SESSION_KEY];
        resolve(
          typeof address === 'string' && isValidAddress(address)
            ? address
            : undefined
        );
      });
    } catch {
      resolve(undefined);
    }
  });

const setSessionAddressCache = (
  address: `0x${string}` | undefined
): Promise<void> =>
  new Promise((resolve) => {
    const storage = getChromeSessionStorage();
    if (!storage) {
      resolve();
      return;
    }

    try {
      if (address) {
        storage.set({ [PHONE_OTP_UNLOCKED_ADDRESS_SESSION_KEY]: address }, () =>
          resolve()
        );
        return;
      }

      storage.remove?.([PHONE_OTP_UNLOCKED_ADDRESS_SESSION_KEY], () =>
        resolve()
      );
      if (!storage.remove) resolve();
    } catch {
      resolve();
    }
  });

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const assertCryptoSupport = () => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error(
      'Secure crypto APIs are not available in this environment.'
    );
  }
};

const validatePassphrase = (passphrase: string) => {
  if (passphrase.trim().length < MIN_VAULT_PASSPHRASE_LENGTH) {
    throw new Error(
      `Passcode must be at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters.`
    );
  }
};

const deriveEncryptionKey = async (
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> => {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    PBKDF2_KEY_USAGES
  );

  const pbkdf2Params: Pbkdf2Params = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: salt as BufferSource,
    iterations,
  };

  const aesGcmParams: AesDerivedKeyParams = {
    name: 'AES-GCM',
    length: 256,
  };

  return window.crypto.subtle.deriveKey(
    pbkdf2Params,
    keyMaterial,
    aesGcmParams,
    false,
    AES_GCM_KEY_USAGES
  );
};

const parseVaultPayload = (
  rawValue: string | null
): PhoneOtpVaultPayload | undefined => {
  if (!rawValue) return undefined;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PhoneOtpVaultPayload>;

    if (
      parsed.version !== VAULT_VERSION ||
      parsed.kdf !== 'PBKDF2' ||
      parsed.hash !== 'SHA-256' ||
      typeof parsed.iterations !== 'number' ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.ciphertext !== 'string'
    ) {
      return undefined;
    }

    return parsed as PhoneOtpVaultPayload;
  } catch {
    return undefined;
  }
};

const notifyPhoneOtpAuthStateChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PHONE_OTP_AUTH_STATE_EVENT));
};

const getLegacyStoredPrivateKey = (): `0x${string}` | undefined => {
  const value = localStorage.getItem(PHONE_OTP_PRIVATE_KEY);
  if (!value || !isValidPrivateKey(value)) return undefined;
  return value;
};

const encryptPrivateKeyWithPassphrase = async (
  privateKey: `0x${string}`,
  passphrase: string
): Promise<PhoneOtpVaultPayload> => {
  assertCryptoSupport();

  const salt = window.crypto.getRandomValues(new Uint8Array(VAULT_SALT_LENGTH));
  const iv = window.crypto.getRandomValues(new Uint8Array(VAULT_IV_LENGTH));

  const encryptionKey = await deriveEncryptionKey(
    passphrase,
    salt,
    VAULT_KDF_ITERATIONS
  );

  const encryptedPrivateKey = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    encryptionKey,
    textEncoder.encode(privateKey)
  );

  return {
    version: VAULT_VERSION,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedPrivateKey)),
  };
};

const decryptPrivateKeyWithPassphrase = async (
  payload: PhoneOtpVaultPayload,
  passphrase: string
): Promise<`0x${string}`> => {
  assertCryptoSupport();

  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  const encryptionKey = await deriveEncryptionKey(
    passphrase,
    salt,
    payload.iterations
  );

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    encryptionKey,
    ciphertext
  );

  const privateKey = textDecoder.decode(decrypted);

  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Wallet vault is invalid.');
  }

  return privateKey;
};

export const isPhoneOtpAuthenticated = () =>
  localStorage.getItem(PHONE_OTP_AUTH_KEY) === 'true';

export const hasPhoneOtpEncryptedVault = () =>
  !!parseVaultPayload(localStorage.getItem(PHONE_OTP_ENCRYPTED_VAULT_KEY));

export const createPhoneOtpPrivateKeyVault = async (
  passphrase: string
): Promise<`0x${string}`> => {
  validatePassphrase(passphrase);

  if (hasPhoneOtpEncryptedVault()) {
    throw new Error('Wallet vault already exists. Unlock your wallet instead.');
  }

  const privateKey = getLegacyStoredPrivateKey() ?? generatePrivateKey();
  const encryptedPayload = await encryptPrivateKeyWithPassphrase(
    privateKey,
    passphrase
  );

  localStorage.setItem(
    PHONE_OTP_ENCRYPTED_VAULT_KEY,
    JSON.stringify(encryptedPayload)
  );

  // Remove legacy plaintext key once vault is persisted.
  localStorage.removeItem(PHONE_OTP_PRIVATE_KEY);

  return privateKey;
};

export const unlockPhoneOtpPrivateKey = async (
  passphrase: string
): Promise<`0x${string}`> => {
  validatePassphrase(passphrase);

  const payload = parseVaultPayload(
    localStorage.getItem(PHONE_OTP_ENCRYPTED_VAULT_KEY)
  );

  if (!payload) {
    throw new Error('No wallet vault found. Please create a wallet first.');
  }

  try {
    return await decryptPrivateKeyWithPassphrase(payload, passphrase);
  } catch {
    throw new Error('Invalid passcode. Unable to unlock wallet.');
  }
};

export const hydrateUnlockedPhoneOtpAddressFromKeyring = async () => {
  if (unlockedPhoneOtpAddress) return unlockedPhoneOtpAddress;

  try {
    const status = await getPillarKeyringStatus();
    const accountAddress = status.isUnlocked ? status.accounts[0] : undefined;
    if (!accountAddress) {
      await setSessionAddressCache(undefined);
      return undefined;
    }

    unlockedPhoneOtpAddress = accountAddress;
    setSessionAddressCache(accountAddress).catch(() => undefined);
    notifyPhoneOtpAuthStateChanged();
    return unlockedPhoneOtpAddress;
  } catch {
    const cachedAddress = await getSessionAddressCache();
    if (!cachedAddress) return undefined;

    unlockedPhoneOtpAddress = cachedAddress;
    notifyPhoneOtpAuthStateChanged();
    return unlockedPhoneOtpAddress;
  }
};

export const hydrateUnlockedPhoneOtpPrivateKeyFromExtensionSession =
  hydrateUnlockedPhoneOtpAddressFromKeyring;

export const setUnlockedPhoneOtpAddress = (
  address: `0x${string}` | undefined
): void => {
  unlockedPhoneOtpAddress = address;
  setSessionAddressCache(address).catch(() => undefined);
  notifyPhoneOtpAuthStateChanged();
};

export const setUnlockedPhoneOtpPrivateKey = (
  privateKey: `0x${string}`
): void => {
  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Invalid private key provided for unlock state.');
  }

  setUnlockedPhoneOtpAddress(privateKeyToAccount(privateKey).address);
};

export const getUnlockedPhoneOtpAddress = () => unlockedPhoneOtpAddress;

export const getUnlockedPhoneOtpPrivateKey = () => undefined;

export const clearUnlockedPhoneOtpPrivateKey = () => {
  unlockedPhoneOtpAddress = undefined;
  setSessionAddressCache(undefined).catch(() => undefined);
  lockPillarKeyring().catch(() => undefined);
  notifyPhoneOtpAuthStateChanged();
};

export const getPhoneOtpAddressFromPrivateKey = (
  privateKey: `0x${string}`
): `0x${string}` => privateKeyToAccount(privateKey).address;

export const markPhoneOtpAuthenticated = (
  phoneNumber: string,
  countryOptionLabel?: string
) => {
  localStorage.setItem(PHONE_OTP_AUTH_KEY, 'true');
  localStorage.setItem(PHONE_OTP_PHONE_NUMBER_KEY, phoneNumber);
  if (countryOptionLabel) {
    localStorage.setItem(
      PHONE_OTP_COUNTRY_OPTION_LABEL_KEY,
      countryOptionLabel
    );
  }
  notifyPhoneOtpAuthStateChanged();
};

export const markPhoneOtpSessionAuthenticated = (
  countryOptionLabel?: string
) => {
  localStorage.setItem(PHONE_OTP_AUTH_KEY, 'true');
  if (countryOptionLabel) {
    localStorage.setItem(
      PHONE_OTP_COUNTRY_OPTION_LABEL_KEY,
      countryOptionLabel
    );
  }
  notifyPhoneOtpAuthStateChanged();
};

export const clearPhoneOtpSession = ({
  preserveLinkedPhoneData = false,
}: {
  preserveLinkedPhoneData?: boolean;
} = {}) => {
  localStorage.removeItem(PHONE_OTP_AUTH_KEY);
  if (!preserveLinkedPhoneData) {
    localStorage.removeItem(PHONE_OTP_PHONE_NUMBER_KEY);
    localStorage.removeItem(PHONE_OTP_COUNTRY_OPTION_LABEL_KEY);
  }
  localStorage.removeItem(PHONE_OTP_VERIFICATION_SID_KEY);
  localStorage.removeItem('EOA_ADDRESS');
  clearUnlockedPhoneOtpPrivateKey();
};

export const getPhoneOtpMinimumPasscodeLength = () =>
  MIN_VAULT_PASSPHRASE_LENGTH;
