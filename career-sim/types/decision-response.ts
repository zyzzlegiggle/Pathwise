
// ---- types for the API response
type DecisionMetrics = {
  firstOffer: string;
  comp1y: string;
  comp3y: string;
  risk: string;
  burnout: string;
};

export type DecisionResponse = {
  metricsA: DecisionMetrics;
  metricsB: DecisionMetrics;
  ttfo: { week: number; Safe: number; Aggressive: number }[];
  echo?: Record<string, unknown>;
};