import type {
  SignableMessage,
  TransactionSerializable,
  TypedDataDefinition,
} from 'viem';

import { PillarKeyringController } from './keyring/PillarKeyringController';
import {
  decodePillarKeyringMessagePayload,
  encodePillarKeyringMessagePayload,
  PillarKeyringHostRequestMessage,
  PillarKeyringResponseMessage,
  PillarKeyringStorageRequestMessage,
  PILLARX_KEYRING_HOST_REQUEST,
  PILLARX_KEYRING_STORAGE_REQUEST,
} from '../utils/pillarKeyringMessaging';

type ChromeStorageAreaLike = {
  get: (
    keys: string | string[] | null,
    callback: (items: Record<string, unknown>) => void
  ) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
};

type ChromeRuntimeLike = {
  lastError?: {
    message?: string;
  };
  onMessage?: {
    addListener: (
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void
      ) => boolean | void
    ) => void;
  };
  sendMessage?: (
    message: unknown,
    callback: (response?: PillarKeyringResponseMessage) => void
  ) => void;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const sendStorageRequest = <T>(
  message: PillarKeyringStorageRequestMessage
): Promise<T> =>
  new Promise((resolve, reject) => {
    const sendMessage = chromeLike?.runtime?.sendMessage;
    if (!sendMessage) {
      reject(new Error('PillarX keyring storage runtime is not available.'));
      return;
    }

    sendMessage(message, (response) => {
      const runtimeError = chromeLike?.runtime?.lastError?.message;
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      if (!response) {
        reject(new Error('PillarX keyring storage did not respond.'));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }

      resolve(decodePillarKeyringMessagePayload(response.result) as T);
    });
  });

const keyringStorage: ChromeStorageAreaLike = {
  get: async (keys, callback) => {
    const requestedKeys =
      typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [];
    const entries = await Promise.all(
      requestedKeys.map(async (key) => [
        key,
        await sendStorageRequest<unknown>({
          type: PILLARX_KEYRING_STORAGE_REQUEST,
          action: 'get',
          key,
        }),
      ])
    );
    const values = Object.fromEntries(entries);
    callback(values);
    return values;
  },
  set: async (items, callback) => {
    await Promise.all(
      Object.entries(items).map(([key, value]) =>
        sendStorageRequest<void>({
          type: PILLARX_KEYRING_STORAGE_REQUEST,
          action: 'set',
          key,
          value: encodePillarKeyringMessagePayload(value),
        })
      )
    );
    callback?.();
  },
};

const keyringController = new PillarKeyringController(keyringStorage);

const handleKeyringHostRequest = async ({
  method,
  payload,
}: PillarKeyringHostRequestMessage) => {
  const decodedPayload = decodePillarKeyringMessagePayload(payload);
  const payloadObject = isObject(decodedPayload) ? decodedPayload : {};

  switch (method) {
    case 'getStatus':
      return keyringController.getStatus();

    case 'unlock': {
      const { passphrase } = payloadObject;
      if (typeof passphrase !== 'string') {
        throw new Error('Invalid keyring unlock payload.');
      }

      return keyringController.unlock(passphrase);
    }

    case 'unlockOrImportPrivateKey': {
      const { passphrase, privateKey } = payloadObject;
      if (
        typeof passphrase !== 'string' ||
        typeof privateKey !== 'string' ||
        !/^0x[a-fA-F0-9]{64}$/.test(privateKey)
      ) {
        throw new Error('Invalid keyring unlock payload.');
      }

      return keyringController.unlockOrImportPrivateKey({
        passphrase,
        privateKey,
      });
    }

    case 'lock':
      keyringController.lock();
      return keyringController.getStatus();

    case 'signMessage':
      return keyringController.signMessage({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        message: payloadObject.message as SignableMessage,
      });

    case 'signTransaction':
      return keyringController.signTransaction({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        transaction: payloadObject.transaction as TransactionSerializable,
      });

    case 'signTypedData':
      return keyringController.signTypedData({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        typedData: payloadObject.typedData as TypedDataDefinition,
      });

    case 'signAuthorization':
      return keyringController.signAuthorization({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        authorization: payloadObject.authorization as Parameters<
          PillarKeyringController['signAuthorization']
        >[0]['authorization'],
      });

    default:
      throw new Error('Unsupported PillarX keyring method.');
  }
};

chromeLike?.runtime?.onMessage?.addListener(
  (message, _sender, sendResponse) => {
    if (
      !isObject(message) ||
      message.type !== PILLARX_KEYRING_HOST_REQUEST ||
      typeof message.method !== 'string'
    ) {
      return false;
    }

    handleKeyringHostRequest(message as PillarKeyringHostRequestMessage)
      .then((result) => {
        sendResponse({
          ok: true,
          result: encodePillarKeyringMessagePayload(result),
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }
);
