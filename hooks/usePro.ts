import { useState, useEffect } from 'react';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';

const RC_API_KEY = 'test_KjroWLMyHLyDfYkJsnsQaRFVTjA';

let configured = false;

function configure() {
  if (configured) return;
  if (Platform.OS === 'android') {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: RC_API_KEY });
    configured = true;
  }
}

export interface ProPackages {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

export function usePro() {
  const [isPro, setIsPro] = useState(false);
  const [packages, setPackages] = useState<ProPackages>({ monthly: null, annual: null });
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configure();
    loadOfferings();
    checkEntitlement();
  }, []);

  async function checkEntitlement() {
    try {
      const info = await Purchases.getCustomerInfo();
      setIsPro(typeof info.entitlements.active['pro'] !== 'undefined');
    } catch (e) {
      console.log('Entitlement check error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) return;
      const monthly = current.availablePackages.find(p => p.identifier === '$rc_monthly') ?? null;
      const annual = current.availablePackages.find(p => p.identifier === '$rc_annual') ?? null;
      setPackages({ monthly, annual });
    } catch (e) {
      console.log('Offerings error:', e);
    }
  }

  async function purchasePackage(pkg: PurchasesPackage) {
    setPurchasing(true);
    setError(null);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      setIsPro(typeof customerInfo.entitlements.active['pro'] !== 'undefined');
    } catch (e: any) {
      if (!e.userCancelled) {
        setError('Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function restorePurchases() {
    setRestoring(true);
    setError(null);
    try {
      const info = await Purchases.restorePurchases();
      const isNowPro = typeof info.entitlements.active['pro'] !== 'undefined';
      setIsPro(isNowPro);
      if (!isNowPro) {
        setError('No previous purchase found.');
      }
    } catch (e) {
      setError('Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  return {
    isPro,
    packages,
    loading,
    purchasing,
    restoring,
    error,
    purchasePackage,
    restorePurchases,
  };
}
