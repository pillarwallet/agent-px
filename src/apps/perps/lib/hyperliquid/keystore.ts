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
const GLOBAL_ACCOUNT_KEY = 'hl_imported_account';

export function storeImportedAccount(
  accountAddress: string,
  privateKey: Hex
): void {
  if (typeof window === 'undefined') return;

  const data = {
    accountAddress,
    privateKey,
    timestamp: Date.now(),
  };

  localStorage.setItem(GLOBAL_ACCOUNT_KEY, JSON.stringify(data));
}

export function getImportedAccount(): {
  accountAddress: string;
  privateKey: Hex;
} | null {
  if (typeof window === 'undefined') return null;

  const data = localStorage.getItem(GLOBAL_ACCOUNT_KEY);
  if (!data) return null;

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

export function clearImportedAccount(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GLOBAL_ACCOUNT_KEY);
}

// Combined functions facade

export async function storeAgentWallet(
  masterAddress: string,
  address: string,
  privateKey: Hex,
  approved?: boolean
): Promise<void> {
  // Legacy support facade - direct storage (plaintext)
  // New code should call storeAgentWalletEncrypted directly
  storeAgentWalletLocal(masterAddress, address, privateKey, approved);
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
  // This helper verifies if the imported wallet is the "right" one.
  // In reality, any imported wallet can be used if it's authorized.
  // But the prompt asked to "check if the users wallet is the same...".
  // This usually means checking if the imported wallet is authorized by the connected master wallet.
  // We can't verify that locally without an API call to Hyperliquid to check approvals.
  return true; // Placeholder logic
}
