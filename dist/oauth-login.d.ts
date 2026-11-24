import type { VendorCli } from "./auth.js";
export interface VendorLoginResult {
    ok: boolean;
    detail: string;
}
/** Spawns the vendor login command. Injectable so tests never spawn. */
export type LoginSpawner = (bin: string, args: string[]) => Promise<number>;
/**
 * Run a vendor's interactive OAuth login to completion.
 *
 * Never throws: a missing binary or a user-aborted flow comes back as a failed
 * result so the caller can render it as a normal message.
 */
export declare function runVendorLogin(cli: VendorCli, spawner?: LoginSpawner): Promise<VendorLoginResult>;
/** Run a vendor's logout. Same never-throws contract as `runVendorLogin`. */
export declare function runVendorLogout(cli: VendorCli, spawner?: LoginSpawner): Promise<VendorLoginResult>;
//# sourceMappingURL=oauth-login.d.ts.map