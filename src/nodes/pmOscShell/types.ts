export type PmOscShellState = {
  pitchId: string | null;
  phasorId: string | null;
  sinId: string | null;
  collapsed: boolean;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    pmOscShell: PmOscShellState;
  }
}

