import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function gaussian(mu: number, sigma: number, x: number) {
  const coef = 1 / (sigma * Math.sqrt(2 * Math.PI));
  return coef * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));

}

