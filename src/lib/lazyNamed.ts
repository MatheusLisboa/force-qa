import { lazy, type ComponentType } from "react";

/** React.lazy para módulos com export nomeado: `lazyNamed(() => import("./X"), "X")`. */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(
  loader: () => Promise<M>,
  name: K
) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType<any> }));
}
