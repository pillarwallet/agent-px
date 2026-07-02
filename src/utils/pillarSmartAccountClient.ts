import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  pad,
  parseAbi,
  parseAbiParameters,
  toHex,
} from 'viem';
import type {
  Address,
  Chain,
  Hex,
  LocalAccount,
  SignableMessage,
  Transport,
  TypedData,
  TypedDataDefinition,
} from 'viem';
import {
  createBundlerClient,
  entryPoint07Abi,
  getUserOperationHash,
  toSmartAccount,
} from 'viem/account-abstraction';
import type {
  SmartAccount,
  SmartAccountImplementation,
} from 'viem/account-abstraction';
import { getChainId, readContract } from 'viem/actions';

export const PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS =
  '0xd6CEDDe84be40893d153Be9d467CD6aD37875b28' as const;
export const PILLAR_ENTRY_POINT_V07_ADDRESS =
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;
export const PILLAR_BOOTSTRAP_ADDRESS =
  '0xCF2808eA7d131d96E5C73Eb0eCD8Dc84D33905C7' as const;
export const PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS =
  '0x0eA25BF9F313344d422B513e1af679484338518E' as const;
export const PILLAR_HOOK_MULTIPLEXER_V2_ADDRESS =
  '0xe629A99Fe2fAD23B1dF6Aa680BA6995cfDA885a3' as const;
export const PILLAR_ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

const PILLAR_KERNEL_STUB_SIGNATURE =
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as const;

export const PILLAR_MODULE_TYPE = {
  VALIDATOR: BigInt(1),
  EXECUTOR: BigInt(2),
  FALLBACK: BigInt(3),
  HOOK: BigInt(4),
  POLICY: BigInt(5),
  SIGNER: BigInt(6),
} as const;

export const PILLAR_CALL_TYPE = {
  SINGLE: '0x00',
  BATCH: '0x01',
  DELEGATECALL: '0xff',
} as const;

export const PILLAR_EXEC_TYPE = {
  DEFAULT: '0x00',
  TRY: '0x01',
} as const;

export const pillarKernelAccountAbi = parseAbi([
  'function execute(bytes32 mode, bytes executionCalldata)',
  'function executeFromExecutor(bytes32 mode, bytes executionCalldata) returns (bytes[] returnData)',
  'function installModule(uint256 moduleTypeId, address module, bytes initData)',
  'function uninstallModule(uint256 moduleTypeId, address module, bytes deInitData)',
  'function isModuleInstalled(uint256 moduleTypeId, address module, bytes additionalContext) view returns (bool)',
  'function supportsExecutionMode(bytes32 encodedMode) view returns (bool)',
  'function supportsModule(uint256 moduleTypeId) view returns (bool)',
]);

export const pillarBootstrapAbi = parseAbi([
  'struct BootstrapConfig { address module; bytes data; }',
  'function singleInitMSA(address validator, bytes data)',
  'function initMSA(BootstrapConfig[] validators, BootstrapConfig[] executors, BootstrapConfig hook, BootstrapConfig[] fallbacks)',
]);

export const pillarModuleAbi = parseAbi(['function onInstall(bytes data)']);

export const pillarHookMultiplexerAbi = parseAbi([
  'function onInstall(bytes data)',
]);

type SmartAccountClient = SmartAccountImplementation<
  typeof entryPoint07Abi,
  '0.7',
  object,
  false
>['client'];

export type PillarSmartAccountOwner = Pick<
  LocalAccount,
  'address' | 'signMessage' | 'signTypedData'
>;

export type PillarCall = {
  to: Address;
  data?: Hex;
  value?: bigint;
};

export type PillarBootstrapConfig = {
  module: Address;
  data: Hex;
};

export type PillarHookMultiplexerSigHookInit = {
  sig: Hex;
  hooks: readonly Address[];
};

export type PillarHookMultiplexerConfig = {
  globalHooks?: readonly Address[];
  valueHooks?: readonly Address[];
  delegatecallHooks?: readonly Address[];
  sigHooks?: readonly PillarHookMultiplexerSigHookInit[];
  targetSigHooks?: readonly PillarHookMultiplexerSigHookInit[];
};

export type PillarSmartAccountExtensions = {
  kernelImplementationAddress: Address;
  encodeInstallModule: (parameters: PillarInstallModuleParameters) => Hex;
  encodeUninstallModule: (parameters: PillarUninstallModuleParameters) => Hex;
  encodeBootstrapModuleSetup: (
    parameters?: PillarBootstrapModuleSetupParameters
  ) => Hex;
  isModuleInstalled: (
    parameters: PillarIsModuleInstalledParameters
  ) => Promise<boolean>;
};

export type PillarSmartAccount = SmartAccount<
  SmartAccountImplementation<
    typeof entryPoint07Abi,
    '0.7',
    PillarSmartAccountExtensions,
    false
  >
>;

export type ToPillarSmartAccountParameters = {
  client: SmartAccountClient;
  owner: PillarSmartAccountOwner;
  chainId?: number;
  entryPointAddress?: Address;
  kernelImplementationAddress?: Address;
};

export type CreatePillarSmartAccountClientParameters =
  ToPillarSmartAccountParameters & {
    chain: Chain;
    bundlerUrl: string;
    transport?: Transport;
  };

export type PillarInstallModuleParameters = {
  moduleType: bigint;
  module: Address;
  initData?: Hex;
};

export type PillarUninstallModuleParameters = {
  moduleType: bigint;
  module: Address;
  deInitData?: Hex;
};

export type PillarIsModuleInstalledParameters = {
  moduleType: bigint;
  module: Address;
  additionalContext?: Hex;
};

export type PillarBootstrapInitMSAParameters = {
  validators?: readonly PillarBootstrapConfig[];
  executors?: readonly PillarBootstrapConfig[];
  hook?: PillarBootstrapConfig;
  fallbacks?: readonly PillarBootstrapConfig[];
};

export type PillarBootstrapModuleSetupParameters = {
  bootstrapAddress?: Address;
  multipleOwnerEcdsaValidator?: Address;
  hookMultiplexer?: Address;
  hookMultiplexerConfig?: PillarHookMultiplexerConfig;
};

const getDefaultBootstrapConfig = (): PillarBootstrapConfig => ({
  module: PILLAR_ZERO_ADDRESS,
  data: encodeFunctionData({
    abi: pillarModuleAbi,
    functionName: 'onInstall',
    args: ['0x'],
  }),
});

export function getPillarExecuteMode({
  callType = PILLAR_CALL_TYPE.SINGLE,
  execType = PILLAR_EXEC_TYPE.DEFAULT,
}: {
  callType?: (typeof PILLAR_CALL_TYPE)[keyof typeof PILLAR_CALL_TYPE];
  execType?: (typeof PILLAR_EXEC_TYPE)[keyof typeof PILLAR_EXEC_TYPE];
} = {}): Hex {
  return concat([
    callType,
    execType,
    '0x00000000',
    '0x00000000',
    '0x00000000000000000000000000000000000000000000',
  ]);
}

export function encodePillarExecuteCall({
  to,
  data = '0x',
  value = BigInt(0),
}: PillarCall): Hex {
  const mode = getPillarExecuteMode({ callType: PILLAR_CALL_TYPE.SINGLE });
  const executionCalldata = concat([to, pad(toHex(value), { size: 32 }), data]);

  return encodeFunctionData({
    abi: pillarKernelAccountAbi,
    functionName: 'execute',
    args: [mode, executionCalldata],
  });
}

export function encodePillarExecuteBatch(calls: readonly PillarCall[]): Hex {
  const mode = getPillarExecuteMode({ callType: PILLAR_CALL_TYPE.BATCH });
  const executionCalldata = encodeAbiParameters(
    parseAbiParameters('(address target,uint256 value,bytes callData)[]'),
    [
      calls.map(({ to, value = BigInt(0), data = '0x' }) => ({
        target: to,
        value,
        callData: data,
      })),
    ]
  );

  return encodeFunctionData({
    abi: pillarKernelAccountAbi,
    functionName: 'execute',
    args: [mode, executionCalldata],
  });
}

export function encodePillarExecuteDelegateCall({
  to,
  data = '0x',
}: Pick<PillarCall, 'to' | 'data'>): Hex {
  const mode = getPillarExecuteMode({
    callType: PILLAR_CALL_TYPE.DELEGATECALL,
  });
  const executionCalldata = concat([to, data]);

  return encodeFunctionData({
    abi: pillarKernelAccountAbi,
    functionName: 'execute',
    args: [mode, executionCalldata],
  });
}

export function makePillarBootstrapConfig(
  module: Address,
  data: Hex = '0x'
): PillarBootstrapConfig {
  return {
    module,
    data: encodeFunctionData({
      abi: pillarModuleAbi,
      functionName: 'onInstall',
      args: [data],
    }),
  };
}

export function encodePillarBootstrapInitMSA({
  validators = [
    makePillarBootstrapConfig(PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS),
  ],
  executors = [getDefaultBootstrapConfig()],
  hook = getDefaultBootstrapConfig(),
  fallbacks = [getDefaultBootstrapConfig()],
}: PillarBootstrapInitMSAParameters = {}): Hex {
  return encodeFunctionData({
    abi: pillarBootstrapAbi,
    functionName: 'initMSA',
    args: [validators, executors, hook, fallbacks],
  });
}

export function encodePillarInstallModuleCall({
  moduleType,
  module,
  initData = '0x',
}: PillarInstallModuleParameters): Hex {
  return encodeFunctionData({
    abi: pillarKernelAccountAbi,
    functionName: 'installModule',
    args: [moduleType, module, initData],
  });
}

export function encodePillarUninstallModuleCall({
  moduleType,
  module,
  deInitData = '0x',
}: PillarUninstallModuleParameters): Hex {
  return encodeFunctionData({
    abi: pillarKernelAccountAbi,
    functionName: 'uninstallModule',
    args: [moduleType, module, deInitData],
  });
}

export function encodePillarHookMultiplexerConfigData({
  globalHooks = [],
  valueHooks = [],
  delegatecallHooks = [],
  sigHooks = [],
  targetSigHooks = [],
}: PillarHookMultiplexerConfig = {}): Hex {
  const sigHookTuples = sigHooks.map(({ sig, hooks }) => [sig, hooks] as const);
  const targetSigHookTuples = targetSigHooks.map(
    ({ sig, hooks }) => [sig, hooks] as const
  );

  return encodeAbiParameters(
    [
      { type: 'address[]' },
      { type: 'address[]' },
      { type: 'address[]' },
      {
        type: 'tuple[]',
        components: [{ type: 'bytes4' }, { type: 'address[]' }],
      },
      {
        type: 'tuple[]',
        components: [{ type: 'bytes4' }, { type: 'address[]' }],
      },
    ],
    [
      globalHooks,
      valueHooks,
      delegatecallHooks,
      sigHookTuples,
      targetSigHookTuples,
    ]
  );
}

export function encodePillarHookMultiplexerInstallData(
  config: PillarHookMultiplexerConfig = {}
): Hex {
  return encodeFunctionData({
    abi: pillarHookMultiplexerAbi,
    functionName: 'onInstall',
    args: [encodePillarHookMultiplexerConfigData(config)],
  });
}

export function encodePillarBootstrapModuleSetupCall({
  bootstrapAddress = PILLAR_BOOTSTRAP_ADDRESS,
  multipleOwnerEcdsaValidator = PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS,
  hookMultiplexer = PILLAR_HOOK_MULTIPLEXER_V2_ADDRESS,
  hookMultiplexerConfig = {},
}: PillarBootstrapModuleSetupParameters = {}): Hex {
  const initMSAData = encodePillarBootstrapInitMSA({
    validators: [makePillarBootstrapConfig(multipleOwnerEcdsaValidator)],
    hook: makePillarBootstrapConfig(
      hookMultiplexer,
      encodePillarHookMultiplexerConfigData(hookMultiplexerConfig)
    ),
  });

  return encodePillarExecuteDelegateCall({
    to: bootstrapAddress,
    data: initMSAData,
  });
}

export async function toPillarSmartAccount({
  client,
  owner,
  chainId,
  entryPointAddress = PILLAR_ENTRY_POINT_V07_ADDRESS,
  kernelImplementationAddress = PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
}: ToPillarSmartAccountParameters): Promise<PillarSmartAccount> {
  const accountAddress = getAddress(owner.address);
  const entryPoint = {
    abi: entryPoint07Abi,
    address: entryPointAddress,
    version: '0.7' as const,
  };

  return toSmartAccount({
    client,
    entryPoint,
    extend: {
      kernelImplementationAddress,
      encodeInstallModule: encodePillarInstallModuleCall,
      encodeUninstallModule: encodePillarUninstallModuleCall,
      encodeBootstrapModuleSetup: encodePillarBootstrapModuleSetupCall,
      async isModuleInstalled({
        moduleType,
        module,
        additionalContext = '0x',
      }: PillarIsModuleInstalledParameters) {
        return readContract(client, {
          abi: pillarKernelAccountAbi,
          address: accountAddress,
          functionName: 'isModuleInstalled',
          args: [moduleType, module, additionalContext],
        });
      },
    },
    async getAddress() {
      return accountAddress;
    },
    async getFactoryArgs() {
      return {
        factory: undefined,
        factoryData: undefined,
      };
    },
    async getNonce({ key = BigInt(0) } = {}) {
      return readContract(client, {
        abi: entryPoint07Abi,
        address: entryPoint.address,
        functionName: 'getNonce',
        args: [accountAddress, key],
      });
    },
    async encodeCalls(calls) {
      if (calls.length === 1) {
        const [call] = calls;
        return encodePillarExecuteCall({
          to: call.to,
          data: call.data,
          value: call.value,
        });
      }

      return encodePillarExecuteBatch(
        calls.map(({ to, data, value }) => ({ to, data, value }))
      );
    },
    async getStubSignature() {
      return PILLAR_KERNEL_STUB_SIGNATURE;
    },
    async signMessage({ message }: { message: SignableMessage }) {
      return owner.signMessage({ message });
    },
    async signTypedData(parameters) {
      const { domain, types, primaryType, message } =
        parameters as TypedDataDefinition<TypedData, string>;

      return owner.signTypedData({
        domain,
        message,
        primaryType,
        types,
      });
    },
    async signUserOperation(parameters) {
      const {
        chainId: userOperationChainId = chainId ??
          client.chain?.id ??
          (await getChainId(client)),
        ...userOperation
      } = parameters;

      const hash = getUserOperationHash({
        chainId: userOperationChainId,
        entryPointAddress: entryPoint.address,
        entryPointVersion: entryPoint.version,
        userOperation: {
          ...userOperation,
          sender: accountAddress,
        },
      });

      return owner.signMessage({ message: { raw: hash } });
    },
  }) as unknown as Promise<PillarSmartAccount>;
}

export async function createPillarSmartAccountClient({
  chain,
  bundlerUrl,
  transport = http(bundlerUrl),
  ...accountParameters
}: CreatePillarSmartAccountClientParameters) {
  const account = await toPillarSmartAccount({
    ...accountParameters,
    chainId: accountParameters.chainId ?? chain.id,
  });

  return createBundlerClient({
    account,
    chain,
    transport,
  });
}

export type PillarSmartAccountClient = Awaited<
  ReturnType<typeof createPillarSmartAccountClient>
>;

export const pillarSmartAccountClient = {
  constants: {
    bootstrapAddress: PILLAR_BOOTSTRAP_ADDRESS,
    entryPointAddress: PILLAR_ENTRY_POINT_V07_ADDRESS,
    hookMultiplexerV2Address: PILLAR_HOOK_MULTIPLEXER_V2_ADDRESS,
    kernel7702ImplementationAddress: PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
    multipleOwnerEcdsaValidatorAddress:
      PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS,
  },
  createClient: createPillarSmartAccountClient,
  encodeBootstrapModuleSetup: encodePillarBootstrapModuleSetupCall,
  encodeExecuteBatch: encodePillarExecuteBatch,
  encodeExecuteCall: encodePillarExecuteCall,
  encodeExecuteDelegateCall: encodePillarExecuteDelegateCall,
  encodeHookMultiplexerInstallData: encodePillarHookMultiplexerInstallData,
  encodeInstallModule: encodePillarInstallModuleCall,
  encodeUninstallModule: encodePillarUninstallModuleCall,
  moduleType: PILLAR_MODULE_TYPE,
  toSmartAccount: toPillarSmartAccount,
} as const;
