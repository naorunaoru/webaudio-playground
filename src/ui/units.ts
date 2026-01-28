export interface Unit {
  format: (value: number) => string;
  parse: (input: string) => number;
}

export const percent: Unit = {
  format: (v) => `${Math.round(v * 100)}%`,
  parse: (s) => parseFloat(s) / 100,
};

export const hz: Unit = {
  format: (v) => `${Math.round(v)} Hz`,
  parse: (s) => parseFloat(s),
};

export const ms: Unit = {
  format: (v) => `${Math.round(v)} ms`,
  parse: (s) => parseFloat(s),
};

export const db: Unit = {
  format: (v) => `${v.toFixed(1)} dB`,
  parse: (s) => parseFloat(s),
};

export const sec: Unit = {
  format: (v) => `${v.toFixed(2)} s`,
  parse: (s) => parseFloat(s),
};
