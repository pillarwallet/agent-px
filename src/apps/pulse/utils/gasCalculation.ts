import { GasConsumptions } from '../../../services/gasless';

export const calculateTopUpGasCost = ({
  chainId,
  needsModuleInstall,
  needsSwap,
}: {
  chainId: number;
  needsModuleInstall: boolean;
  needsSwap: boolean;
}): number => {
  const isArbitrum = chainId === 42161;
  let totalGas = 0;

  // Always need deposit
  totalGas += isArbitrum
    ? GasConsumptions.topup_deposit_arb
    : GasConsumptions.topup_deposit;

  // Add module install if needed
  if (needsModuleInstall) {
    totalGas += isArbitrum
      ? GasConsumptions.topup_install_modules_arb
      : GasConsumptions.topup_install_modules;
  }

  // Add swap if needed
  if (needsSwap) {
    totalGas += isArbitrum
      ? GasConsumptions.topup_swap_arb
      : GasConsumptions.topup_swap;
  }

  return totalGas;
};
