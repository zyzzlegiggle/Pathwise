'use client'

export type DecisionResponse = {
  metricsA: { firstOffer: string; comp1y: string; comp3y: string; risk: string; burnout: string };
  metricsB: { firstOffer: string; comp1y: string; comp3y: string; risk: string; burnout: string };
  ttfo: { week: number; Safe: number; Aggressive: number }[]; // server still returns Safe/Aggressive
  evidence?: unknown;
  echo?: Record<string, unknown>;
};

