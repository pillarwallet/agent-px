import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export function generateAgentWallet(): { address: string; privateKey: Hex } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey: privateKey,
  };
}

// WARNING: In production, NEVER store private keys in localStorage or the browser!
// This is for DEMO purposes only. Use server-side HSM/KMS in production.

// Local storage for caching (per master wallet)
function getStorageKey(masterAddress: string, suffix: string): string {
  return `hl_agent_${masterAddress.toLowerCase()}_${suffix}`;
}

// Local storage functions (for fast access/caching)
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
  localStorage.removeItem(getStorageKey(masterAddress, 'approved'));
}

// Global imported account storage (not tied to connected wallet)
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

// Remote storage functions removed as per user request to use Local Storage only.
export async function storeAgentWalletRemote(
  masterAddress: string,
  agentAddress: string,
  agentPrivateKey: Hex,
  approved: boolean = false
): Promise<void> {
  // No-op
}

export async function getAgentWalletRemote(
  masterAddress: string
): Promise<{ address: string; privateKey: Hex; approved: boolean } | null> {
  return null;
}

export async function updateAgentApprovalRemote(
  masterAddress: string,
  approved: boolean
): Promise<void> {
  // No-op
}

export async function deleteAgentWalletRemote(
  masterAddress: string
): Promise<void> {
  // No-op
}

// Combined functions (Local Storage Only as requested)
export async function storeAgentWallet(
  masterAddress: string,
  address: string,
  privateKey: Hex,
  approved?: boolean
): Promise<void> {
  // Store locally only
  storeAgentWalletLocal(masterAddress, address, privateKey, approved);
}

export async function getAgentWallet(
  masterAddress: string
): Promise<{ address: string; privateKey: Hex; approved: boolean } | null> {
  // Return local cache
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

export async function deleteAllForMasterRemote(
  masterAddress: string
): Promise<void> {
  await deleteAgentWalletRemote(masterAddress);
}
