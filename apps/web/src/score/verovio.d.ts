declare module "verovio/wasm" {
  export interface VerovioModule {
    cwrap(
      name: string,
      returnType: string | null,
      argumentTypes: string[]
    ): (...args: unknown[]) => unknown;
  }

  export default function createVerovioModule(): Promise<VerovioModule>;
}

declare module "verovio/esm" {
  import type { VerovioModule } from "verovio/wasm";

  export class VerovioToolkit {
    constructor(module: VerovioModule);

    destroy(): void;
    getElementsAtTime(milliseconds: number): {
      chords?: string[];
      measure?: string;
      notes?: string[];
      page?: number;
      rests?: string[];
    };
    getLog(): string;
    getMIDIValuesForElement(xmlId: string): {
      duration?: number;
      pitch?: number;
      time?: number;
    };
    getPageCount(): number;
    getPageWithElement(xmlId: string): number;
    getTimeForElement(xmlId: string): number;
    getTimesForElement(xmlId: string): {
      qfracDuration?: Array<[number, number]>;
      qfracOff?: Array<[number, number]>;
      qfracOn?: Array<[number, number]>;
      qfracTiedDuration?: Array<[number, number]>;
      tstampOff?: number[];
      tstampOn?: number[];
    };
    getVersion(): string;
    loadData(data: string): boolean;
    renderToMIDI(): string;
    renderToSVG(pageNumber?: number, includeXmlDeclaration?: boolean): string;
    renderToTimemap(options?: Record<string, unknown>): Array<{
      measureOff?: string;
      measureOn?: string;
      off?: string[];
      on?: string[];
      qstamp?: number;
      tempo?: number;
      tstamp: number;
    }>;
    setOptions(options: Record<string, unknown>): void;
  }
}
