import type {
  AuthorizationRequest,
  Hex,
  SignableMessage,
  SignedAuthorization,
  TransactionSerializable,
  TypedDataDefinition,
} from 'viem';

import type { PillarKeyringStatus } from '../extension/keyring/PillarKeyringController';

export const PILLARX_KEYRING_REQUEST = 'PILLARX_KEYRING_REQUEST';

export type PillarKeyringRequestMethod =
  | 'getStatus'
  | 'unlock'
  | 'unlockOrImportPrivateKey'
  | 'lock'
  | 'signMessage'
  | 'signTransaction'
  | 'signTypedData'
  | 'signAuthorization';

export type PillarKeyringRequestMessage = {
  type: typeof PILLARX_KEYRING_REQUEST;
  method: PillarKeyringRequestMethod;
  payload?: unknown;
};

export type PillarKeyringResponseMessage<T = unknown> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: string;
    };

type ChromeRuntimeLike = {
  lastError?: {
    message?: string;
  };
  sendMessage?: (
    message: unknown,
    callback: (response?: PillarKeyringResponseMessage) => void
  ) => void;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

type EncodedBigInt = {
  pillarXType: 'bigint';
  value: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEncodedBigInt = (value: unknown): value is EncodedBigInt =>
  isObject(value) &&
  value.pillarXType === 'bigint' &&
  typeof value.value === 'string';

const stripUndefinedValues = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );

const sanitizeTransactionForKeyring = (
  transaction: TransactionSerializable
): TransactionSerializable =>
  stripUndefinedValues({
    accessList: transaction.accessList,
    authorizationList: transaction.authorizationList,
    blobVersionedHashes: transaction.blobVersionedHashes,
    chainId: transaction.chainId,
    data: transaction.data,
    gas: transaction.gas,
    gasPrice: transaction.gasPrice,
    maxFeePerBlobGas: transaction.maxFeePerBlobGas,
    maxFeePerGas: transaction.maxFeePerGas,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
    nonce: transaction.nonce,
    to: transaction.to,
    type: transaction.type,
    value: transaction.value,
  }) as TransactionSerializable;

export const encodePillarKeyringMessagePayload = (value: unknown): unknown => {
  if (typeof value === 'bigint') {
    return {
      pillarXType: 'bigint',
      value: value.toString(),
    } satisfies EncodedBigInt;
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodePillarKeyringMessagePayload(item));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => typeof entry !== 'function')
        .map(([key, entry]) => [key, encodePillarKeyringMessagePayload(entry)])
    );
  }

  return value;
};

export const decodePillarKeyringMessagePayload = (value: unknown): unknown => {
  if (isEncodedBigInt(value)) {
    return BigInt(value.value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodePillarKeyringMessagePayload(item));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        decodePillarKeyringMessagePayload(entry),
      ])
    );
  }

  return value;
};

export const sendPillarKeyringRequest = <T>(
  method: PillarKeyringRequestMethod,
  payload?: unknown
): Promise<T> =>
  new Promise((resolve, reject) => {
    const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
    const sendMessage = chromeLike?.runtime?.sendMessage;

    if (!sendMessage) {
      reject(new Error('PillarX keyring runtime is not available.'));
      return;
    }

    const message: PillarKeyringRequestMessage = {
      type: PILLARX_KEYRING_REQUEST,
      method,
      payload: encodePillarKeyringMessagePayload(payload),
    };

    try {
      sendMessage(message, (response) => {
        const runtimeError = chromeLike?.runtime?.lastError?.message;
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }

        if (!response) {
          reject(new Error('PillarX keyring did not return a response.'));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }

        resolve(decodePillarKeyringMessagePayload(response.result) as T);
      });
    } catch (error) {
      reject(error);
    }
  });

export const getPillarKeyringStatus = () =>
  sendPillarKeyringRequest<PillarKeyringStatus>('getStatus');

export const unlockPillarKeyring = (passphrase: string) =>
  sendPillarKeyringRequest<PillarKeyringStatus>('unlock', {
    passphrase,
  });

export const unlockOrImportPillarKeyringPrivateKey = ({
  passphrase,
  privateKey,
}: {
  passphrase: string;
  privateKey: `0x${string}`;
}) =>
  sendPillarKeyringRequest<PillarKeyringStatus>('unlockOrImportPrivateKey', {
    passphrase,
    privateKey,
  });

export const lockPillarKeyring = () =>
  sendPillarKeyringRequest<PillarKeyringStatus>('lock');

export const signMessageViaPillarKeyring = ({
  address,
  message,
}: {
  address?: `0x${string}`;
  message: SignableMessage;
}) =>
  sendPillarKeyringRequest<Hex>('signMessage', {
    address,
    message,
  });

export const signTransactionViaPillarKeyring = ({
  address,
  transaction,
}: {
  address?: `0x${string}`;
  transaction: TransactionSerializable;
}) =>
  sendPillarKeyringRequest<Hex>('signTransaction', {
    address,
    transaction: sanitizeTransactionForKeyring(transaction),
  });

export const signTypedDataViaPillarKeyring = ({
  address,
  typedData,
}: {
  address?: `0x${string}`;
  typedData: TypedDataDefinition;
}) =>
  sendPillarKeyringRequest<Hex>('signTypedData', {
    address,
    typedData,
  });

export const signAuthorizationViaPillarKeyring = ({
  address,
  authorization,
}: {
  address?: `0x${string}`;
  authorization: AuthorizationRequest;
}) =>
  sendPillarKeyringRequest<SignedAuthorization>('signAuthorization', {
    address,
    authorization,
  });
