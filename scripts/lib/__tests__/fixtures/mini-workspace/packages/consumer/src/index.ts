import { sharedHelper, type SharedType } from "@graviola/provider";
import * as ProviderNS from "@graviola/provider";
export { SHARED_CONST } from "@graviola/provider";

export function useProvider(): SharedType {
  const h = sharedHelper();
  const ns = ProviderNS.SHARED_CONST;
  return { id: `${h}-${ns}` };
}
