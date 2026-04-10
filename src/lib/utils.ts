import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toUTCString().replace("GMT", "UTC");
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diff = now - ts;

  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
