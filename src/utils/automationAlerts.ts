import type { AutomationOrder } from '../services/automationApi';

const STORAGE_KEY = 'pillarx.automation.alerts.v1';
export const AUTOMATION_ALERTS_CHANGED = 'pillarx:automation-alerts-changed';

type StoredAlerts = Record<string, AutomationOrder[]>;

const readAll = (): StoredAlerts => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const readAutomationAlerts = (walletAddress?: string) => {
  if (!walletAddress) return [];
  return readAll()[walletAddress.toLowerCase()] || [];
};

export const saveAutomationAlert = (order: AutomationOrder) => {
  const stored = readAll();
  const key = order.walletAddress.toLowerCase();
  const current = stored[key] || [];
  stored[key] = [order, ...current.filter((item) => item.id !== order.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  window.dispatchEvent(new CustomEvent(AUTOMATION_ALERTS_CHANGED));
};
