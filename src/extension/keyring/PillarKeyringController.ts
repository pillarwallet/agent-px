import type {
  AuthorizationRequest,
  Hex,
  SignableMessage,
  SignedAuthorization,
  TransactionSerializable,
  TypedDataDefinition,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const PILLARX_KEYRING_VAULT_STORAGE_KEY = 'PILLARX_KEYRING_VAULT_V1';

const VAULT_VERSION = 1;
const VAULT_KDF_ITERATIONS = 350_000;
const VAULT_SALT_LENGTH = 16;
const VAULT_IV_LENGTH = 12;

type ChromeStorageAreaLike = {
  get: (
    keys: string | string[] | null,
    callback: (items: Record<string, unknown>) => void
  ) => Promise<Record<string, unknown> | void> | void;
  set: (
    items: Record<string, unknown>,
    callback?: () => void
  ) => Promise<void> | void;
};

type PillarKeyringVaultPayload = {
  version: number;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

type PillarSerializedSimpleKeyring = {
  type: 'Simple Key Pair';
  accounts: {
    address: `0x${string}`;
    privateKey: `0x${string}`;
  }[];
};

type PillarSerializedKeyringState = {
  version: number;
  keyrings: PillarSerializedSimpleKeyring[];
};

export type PillarKeyringStatus = {
  accounts: `0x${string}`[];
  hasVault: boolean;
  isUnlocked: boolean;
};

export type PillarUnlockedAccount = ReturnType<typeof privateKeyToAccount>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const isValidPrivateKey = (value: string): value is `0x${string}` =>
  /^0x[a-fA-F0-9]{64}$/.test(value);

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

const getCrypto = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure crypto APIs are not available.');
  }

  return globalThis.crypto;
};

const validatePassphrase = (passphrase: string) => {
  if (!passphrase || passphrase.trim().length < 8) {
    throw new Error('Passcode must be at least 8 characters.');
  }
};

const storageGet = <T>(
  storage: ChromeStorageAreaLike | undefined,
  key: string
): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    if (!storage) {
      resolve(undefined);
      return;
    }

    let settled = false;
    const finish = (items: Record<string, unknown> | void) => {
      if (settled) return;
      settled = true;
      resolve((items as Record<string, unknown> | undefined)?.[key] as
        | T
        | undefined);
    };

    try {
      const result = storage.get([key], finish);
      if (result instanceof Promise) {
        result.then(finish).catch(reject);
      }
    } catch {
      resolve(undefined);
    }
  });

const storageSet = (
  storage: ChromeStorageAreaLike | undefined,
  key: string,
  value: unknown
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!storage) {
      reject(new Error('Extension storage is not available.'));
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const result = storage.set({ [key]: value }, finish);
      if (result instanceof Promise) {
        result.then(finish).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });

const deriveEncryptionKey = async (
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> => {
  const crypto = getCrypto();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptKeyringState = async (
  state: PillarSerializedKeyringState,
  passphrase: string
): Promise<PillarKeyringVaultPayload> => {
  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(VAULT_SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(VAULT_IV_LENGTH));
  const encryptionKey = await deriveEncryptionKey(
    passphrase,
    salt,
    VAULT_KDF_ITERATIONS
  );
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    encryptionKey,
    textEncoder.encode(JSON.stringify(state))
  );

  return {
    version: VAULT_VERSION,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

const decryptKeyringState = async (
  payload: PillarKeyringVaultPayload,
  passphrase: string
): Promise<PillarSerializedKeyringState> => {
  const crypto = getCrypto();
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const encryptionKey = await deriveEncryptionKey(
    passphrase,
    salt,
    payload.iterations
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    encryptionKey,
    ciphertext
  );
  const parsed = JSON.parse(
    textDecoder.decode(decrypted)
  ) as Partial<PillarSerializedKeyringState>;

  if (
    parsed.version !== VAULT_VERSION ||
    !Array.isArray(parsed.keyrings) ||
    parsed.keyrings.some(
      (keyring) =>
        keyring.type !== 'Simple Key Pair' ||
        !Array.isArray(keyring.accounts) ||
        keyring.accounts.some(
          (account) =>
            typeof account.address !== 'string' ||
            typeof account.privateKey !== 'string' ||
            !isValidPrivateKey(account.privateKey)
        )
    )
  ) {
    throw new Error('Keyring vault is invalid.');
  }

  return parsed as PillarSerializedKeyringState;
};

const parseVaultPayload = (
  value: unknown
): PillarKeyringVaultPayload | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const parsed = value as Partial<PillarKeyringVaultPayload>;
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

  return parsed as PillarKeyringVaultPayload;
};

export class PillarKeyringController {
  private unlockedAccounts = new Map<`0x${string}`, PillarUnlockedAccount>();

  constructor(private readonly storage?: ChromeStorageAreaLike) {}

  async getStatus(): Promise<PillarKeyringStatus> {
    return {
      accounts: this.getUnlockedAddresses(),
      hasVault: await this.hasVault(),
      isUnlocked: this.unlockedAccounts.size > 0,
    };
  }

  async hasVault() {
    return Boolean(
      parseVaultPayload(
        await storageGet(this.storage, PILLARX_KEYRING_VAULT_STORAGE_KEY)
      )
    );
  }

  async unlock(passphrase: string) {
    validatePassphrase(passphrase);

    const payload = parseVaultPayload(
      await storageGet(this.storage, PILLARX_KEYRING_VAULT_STORAGE_KEY)
    );
    if (!payload) {
      throw new Error('No PillarX keyring vault found.');
    }

    const state = await decryptKeyringState(payload, passphrase);
    this.loadSerializedState(state);
    return this.getStatus();
  }

  async importPrivateKey({
    passphrase,
    privateKey,
  }: {
    passphrase: string;
    privateKey: `0x${string}`;
  }) {
    validatePassphrase(passphrase);
    if (!isValidPrivateKey(privateKey)) {
      throw new Error('Invalid private key.');
    }

    const account = privateKeyToAccount(privateKey);
    const state: PillarSerializedKeyringState = {
      version: VAULT_VERSION,
      keyrings: [
        {
          type: 'Simple Key Pair',
          accounts: [
            {
              address: account.address,
              privateKey,
            },
          ],
        },
      ],
    };
    const encryptedState = await encryptKeyringState(state, passphrase);
    await storageSet(
      this.storage,
      PILLARX_KEYRING_VAULT_STORAGE_KEY,
      encryptedState
    );
    this.loadSerializedState(state);
    return this.getStatus();
  }

  async unlockOrImportPrivateKey({
    passphrase,
    privateKey,
  }: {
    passphrase: string;
    privateKey: `0x${string}`;
  }) {
    const address = privateKeyToAccount(privateKey).address.toLowerCase();

    if (await this.hasVault()) {
      try {
        const status = await this.unlock(passphrase);
        const unlockedAddress = status.accounts.find(
          (accountAddress) => accountAddress.toLowerCase() === address
        );
        if (unlockedAddress) return status;
      } catch {
        // Fall through to rebuild the keyring vault from the legacy vault key.
      }
    }

    return this.importPrivateKey({ passphrase, privateKey });
  }

  lock() {
    this.unlockedAccounts.clear();
  }

  getUnlockedAddresses() {
    return Array.from(this.unlockedAccounts.keys());
  }

  getUnlockedAccount(address?: `0x${string}`) {
    if (address) {
      return this.unlockedAccounts.get(address);
    }

    return this.unlockedAccounts.values().next().value as
      | PillarUnlockedAccount
      | undefined;
  }

  async signMessage({
    address,
    message,
  }: {
    address?: `0x${string}`;
    message: SignableMessage;
  }): Promise<Hex> {
    const account = this.requireUnlockedAccount(address);
    return account.signMessage({ message });
  }

  async signTransaction({
    address,
    transaction,
  }: {
    address?: `0x${string}`;
    transaction: TransactionSerializable;
  }): Promise<Hex> {
    const account = this.requireUnlockedAccount(address);
    return account.signTransaction(transaction);
  }

  async signTypedData({
    address,
    typedData,
  }: {
    address?: `0x${string}`;
    typedData: TypedDataDefinition;
  }): Promise<Hex> {
    const account = this.requireUnlockedAccount(address);
    return account.signTypedData(typedData);
  }

  async signAuthorization({
    address,
    authorization,
  }: {
    address?: `0x${string}`;
    authorization: AuthorizationRequest;
  }): Promise<SignedAuthorization> {
    const account = this.requireUnlockedAccount(address);
    return account.signAuthorization(authorization);
  }

  private loadSerializedState(state: PillarSerializedKeyringState) {
    const accounts = new Map<`0x${string}`, PillarUnlockedAccount>();

    state.keyrings.forEach((keyring) => {
      keyring.accounts.forEach(({ privateKey }) => {
        const account = privateKeyToAccount(privateKey);
        accounts.set(account.address, account);
      });
    });

    this.unlockedAccounts = accounts;
  }

  private requireUnlockedAccount(address?: `0x${string}`) {
    const account = this.getUnlockedAccount(address);
    if (!account) {
      throw new Error('PillarX keyring is locked.');
    }
    return account;
  }
}
