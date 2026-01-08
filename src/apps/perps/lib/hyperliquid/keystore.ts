import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encryptWithPin, decryptWithPin, type EncryptedData } from '../encryption';

// Module-level cache for unlocked private key (cleared on page refresh)
let cachedPrivateKey: Hex | null = null;

export function generateAgentWallet(): { address: string; privateKey: Hex } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey: privateKey,
  };
}

// Storage Keys Helper
function getStorageKey(masterAddress: string, suffix: string): string {
  return `hl_agent_${masterAddress.toLowerCase()}_${suffix}`;
}

// ----- ENCRYPTED STORAGE (Preferred) -----

export async function storeAgentWalletEncrypted(
  masterAddress: string,
  address: string,
  privateKey: Hex,
  pin: string,
  approved: boolean = false
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const encrypted = await encryptWithPin(privateKey, pin);
    const storageData = JSON.stringify(encrypted);

    localStorage.setItem(getStorageKey(masterAddress, 'address'), address);
    localStorage.setItem(getStorageKey(masterAddress, 'encrypted_key'), storageData);

    // Clear legacy plaintext key if it exists to upgrade security
    localStorage.removeItem(getStorageKey(masterAddress, 'key'));

    localStorage.setItem(getStorageKey(masterAddress, 'approved'), String(approved));

    // Hot-load the cache so it's immediately available without unlocking again
    cachedPrivateKey = privateKey;
  } catch (error) {
    console.error('Failed to encrypt wallet:', error);
    throw new Error('Encryption failed');
  }
}

export async function unlockAgentWallet(
  masterAddress: string,
  pin: string
): Promise<{ address: string; privateKey: Hex; approved: boolean } | null> {
  if (typeof window === 'undefined') return null;

  const address = localStorage.getItem(getStorageKey(masterAddress, 'address'));
  const encryptedkeyData = localStorage.getItem(getStorageKey(masterAddress, 'encrypted_key'));
  const approved = localStorage.getItem(getStorageKey(masterAddress, 'approved')) === 'true';

  if (!address || !encryptedkeyData) {
    // Fallback using deprecated plaintext for migration/legacy support
    return getAgentWalletLocal(masterAddress);
  }

  try {
    const encryptedData: EncryptedData = JSON.parse(encryptedkeyData);
    const privateKey = await decryptWithPin(encryptedData, pin);

    cachedPrivateKey = privateKey as Hex;

    return {
      address,
      privateKey: privateKey as Hex,
      approved
    };
  } catch (error) {
    console.error('Failed to unlock wallet:', error);
    throw error; // Let UI handle "Incorrect PIN"
  }
}

export function isAgentWalletEncrypted(masterAddress: string): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(getStorageKey(masterAddress, 'encrypted_key'));
}

export function hasAgentWallet(masterAddress: string): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(getStorageKey(masterAddress, 'address'));
}


// ----- LEGACY PLAINTEXT STORAGE (Deprecated) -----

export function storeAgentWalletLocal(
  masterAddress: string,
  address: string,
  privateKey: Hex,
  approved?: boolean
): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(getStorageKey(masterAddress, 'address'), address);
  localStorage.setItem(getStorageKey(masterAddress, 'key'), privateKey);
  if (approved !== undefined) {
    localStorage.setItem(
      getStorageKey(masterAddress, 'approved'),
      String(approved)
    );
  }
  // Clear cache on new plaintext storage
  cachedPrivateKey = null;
}

export function getAgentWalletLocal(
  masterAddress: string
): { address: string; privateKey: Hex; approved: boolean } | null {
  if (typeof window === 'undefined') return null;

  const address = localStorage.getItem(getStorageKey(masterAddress, 'address'));
  const privateKey = localStorage.getItem(
    getStorageKey(masterAddress, 'key')
  ) as Hex;
  const approved =
    localStorage.getItem(getStorageKey(masterAddress, 'approved')) === 'true';

  if (!address || !privateKey) return null;

  return { address, privateKey, approved };
}

export function clearAgentWalletLocal(masterAddress: string): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(getStorageKey(masterAddress, 'address'));
  localStorage.removeItem(getStorageKey(masterAddress, 'key'));
  localStorage.removeItem(getStorageKey(masterAddress, 'encrypted_key'));
  localStorage.removeItem(getStorageKey(masterAddress, 'approved'));
  // Clear cache when wallet is cleared
  cachedPrivateKey = null;
}

// Global imported account storage (also plaintext by default in old code, ideally should encrypt too)
// For now, leaving as is or upgrading if requested. User request focused on agent wallet.
// Global Imported Account Storage
const GLOBAL_IMPORTED_ADDRESS_KEY = 'hl_imported_address';
const GLOBAL_IMPORTED_ENCRYPTED_KEY = 'hl_imported_encrypted_key';
const GLOBAL_ACCOUNT_KEY = 'hl_imported_account'; // Legacy plaintext

let cachedImportedKey: Hex | null = null;

export async function storeImportedAccountEncrypted(
  address: string,
  privateKey: Hex,
  pin: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const encrypted = await encryptWithPin(privateKey, pin);
    const storageData = JSON.stringify(encrypted);

    localStorage.setItem(GLOBAL_IMPORTED_ADDRESS_KEY, address);
    localStorage.setItem(GLOBAL_IMPORTED_ENCRYPTED_KEY, storageData);

    // Clear legacy plaintext
    localStorage.removeItem(GLOBAL_ACCOUNT_KEY);

    // Cache it
    cachedImportedKey = privateKey;
  } catch (error) {
    console.error('Failed to encrypt imported account:', error);
    throw new Error('Encryption failed');
  }
}

export async function unlockImportedAccount(
  pin: string
): Promise<{ accountAddress: string; privateKey: Hex } | null> {
  if (typeof window === 'undefined') return null;

  const address = localStorage.getItem(GLOBAL_IMPORTED_ADDRESS_KEY);
  const encryptedkeyData = localStorage.getItem(GLOBAL_IMPORTED_ENCRYPTED_KEY);

  if (!address || !encryptedkeyData) return null;

  try {
    const encryptedData: EncryptedData = JSON.parse(encryptedkeyData);
    const privateKey = await decryptWithPin(encryptedData, pin);

    cachedImportedKey = privateKey as Hex;

    return {
      accountAddress: address,
      privateKey: privateKey as Hex,
    };
  } catch (error) {
    console.error('Failed to unlock imported account:', error);
    throw error;
  }
}

export function isImportedAccountEncrypted(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(GLOBAL_IMPORTED_ENCRYPTED_KEY);
}

export function getImportedAccountAddress(): string | null {
  if (typeof window === 'undefined') return null;
  // Check new key first, then legacy
  return (
    localStorage.getItem(GLOBAL_IMPORTED_ADDRESS_KEY) ||
    (localStorage.getItem(GLOBAL_ACCOUNT_KEY)
      ? JSON.parse(localStorage.getItem(GLOBAL_ACCOUNT_KEY)!).accountAddress
      : null)
  );
}

export function storeImportedAccount(
  accountAddress: string,
  privateKey: Hex,
  pin: string
): void {
  // Enforce encryption by delegating
  storeImportedAccountEncrypted(accountAddress, privateKey, pin);
}

export function getImportedAccount(): {
  accountAddress: string;
  privateKey: Hex;
} | null {
  if (typeof window === 'undefined') return null;

  // 1. Check Cache
  if (cachedImportedKey) {
    const address = getImportedAccountAddress();
    if (address) {
      return { accountAddress: address, privateKey: cachedImportedKey };
    }
  }

  // 2. Check Legacy Plaintext
  const data = localStorage.getItem(GLOBAL_ACCOUNT_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      return {
        accountAddress: parsed.accountAddress,
        privateKey: parsed.privateKey as Hex,
      };
    } catch {
      return null;
    }
  }

  // 3. If Encrypted and not cached force user to unlock (return null here)
  if (isImportedAccountEncrypted()) {
    return null;
  }

  return null;
}

export function clearImportedAccount(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GLOBAL_ACCOUNT_KEY);
  localStorage.removeItem(GLOBAL_IMPORTED_ADDRESS_KEY);
  localStorage.removeItem(GLOBAL_IMPORTED_ENCRYPTED_KEY);
  cachedImportedKey = null;
}

// Combined functions facade

export function updateAgentApproval(
  masterAddress: string,
  approved: boolean
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(masterAddress, 'approved'), String(approved));
}

/**
 * @deprecated Use storeAgentWalletEncrypted instead. This function stores keys in plaintext.
 */
export async function storeAgentWallet(
  masterAddress: string,
  address: string,
  privateKey: Hex,
  pin: string,
  approved: boolean = false
): Promise<void> {
  // Enforce encryption
  return storeAgentWalletEncrypted(masterAddress, address, privateKey, pin, approved);
}

export async function getAgentWallet(
  masterAddress: string
): Promise<{ address: string; privateKey: Hex; approved: boolean } | null> {
  // Check memory cache first
  if (cachedPrivateKey) {
    const address = localStorage.getItem(getStorageKey(masterAddress, 'address'));
    if (address) {
      const approved = localStorage.getItem(getStorageKey(masterAddress, 'approved')) === 'true';
      return { address, privateKey: cachedPrivateKey, approved };
    }
  }

  if (isAgentWalletEncrypted(masterAddress)) {
    // Locked and not in memory
    // We cannot return the key. The caller must handle this.
    // For backward compatibility, we return null so the app thinks "No active wallet" 
    // (which implies one needs to be set up OR unlocked).
    return null;
  }

  // Legacy plaintext
  return getAgentWalletLocal(masterAddress);
}

export async function clearAgentWallet(masterAddress: string): Promise<void> {
  clearAgentWalletLocal(masterAddress);
}

export function clearAllAgentWalletsLocal(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('hl_agent_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function getAgentAddress(masterAddress: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(getStorageKey(masterAddress, 'address'));
}

export async function checkWalletMatch(importedAddress: string, masterAddress: string): Promise<boolean> {
  // Normalize addresses for comparison
  const normalize = (addr: string) => addr.toLowerCase();
  return normalize(importedAddress) === normalize(getAgentAddress(masterAddress) || '');
}
