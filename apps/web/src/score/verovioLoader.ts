import createVerovioModule, { type VerovioModule } from "verovio/wasm";

let modulePromise: Promise<VerovioModule> | undefined;

/**
 * Loads the Verovio WASM runtime once and shares it between score renderers.
 * A failed load is not cached, allowing a later attempt after a transient error.
 */
export function loadVerovioModule(): Promise<VerovioModule> {
  if (!modulePromise) {
    modulePromise = createVerovioModule().catch((error: unknown) => {
      modulePromise = undefined;
      throw error;
    });
  }

  return modulePromise;
}
