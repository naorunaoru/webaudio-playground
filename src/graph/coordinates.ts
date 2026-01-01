import type React from "react";

export function localPointFromPointerEvent(
  root: HTMLElement,
  e: React.PointerEvent
): { x: number; y: number } {
  const rect = root.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function localPointFromClientPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = root.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function viewToWorld(
  p: { x: number; y: number },
  scrollX: number,
  scrollY: number
): { x: number; y: number } {
  return { x: p.x + scrollX, y: p.y + scrollY };
}

export function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}
