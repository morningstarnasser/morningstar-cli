import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const validId = (id) => Number.isSafeInteger(id) && Number(id) > 0;
export class TelegramAccess {
    now;
    dir;
    file;
    state;
    pending = new Map();
    constructor(token, users = [], root = join(homedir(), ".morningstar", "channels", "telegram"), now = Date.now) {
        this.now = now;
        this.dir = join(root, createHash("sha256").update(token).digest("hex").slice(0, 16));
        this.file = join(this.dir, "access.json");
        this.state = { policy: users.length ? "allowlist" : "pairing", users: users.filter(validId), offset: 0 };
        if (existsSync(this.dir) && lstatSync(this.dir).isSymbolicLink())
            throw new Error("Telegram-Zustandsordner darf kein Symlink sein.");
        if (existsSync(this.file)) {
            const stat = lstatSync(this.file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
                throw new Error("Ungültiger Telegram-Zustand.");
            const s = JSON.parse(readFileSync(this.file, "utf8"));
            if (!["pairing", "allowlist", "disabled"].includes(s.policy) || !Array.isArray(s.users) || !s.users.every(validId) || !Number.isSafeInteger(s.offset) || s.offset < 0)
                throw new Error("Ungültiger Telegram-Zustand.");
            this.state = s;
        }
    }
    save() {
        mkdirSync(this.dir, { recursive: true, mode: 0o700 });
        if (lstatSync(this.dir).isSymbolicLink())
            throw new Error("Ungültiger Telegram-Zustandsordner.");
        const temp = join(this.dir, `access-${randomBytes(8).toString("hex")}.tmp`);
        writeFileSync(temp, JSON.stringify(this.state), { flag: "wx", mode: 0o600 });
        renameSync(temp, this.file);
    }
    allowed(user, chat, type) { return this.state.policy !== "disabled" && type === "private" && user === chat && this.state.users.includes(user); }
    request(user, chat) {
        if (this.state.policy !== "pairing" || !validId(user) || user !== chat)
            return null;
        for (const [code, entry] of this.pending)
            if (entry.expires < this.now())
                this.pending.delete(code);
        for (const [code, entry] of this.pending)
            if (entry.user === user) {
                if (this.now() - entry.sent < 60000)
                    return null;
                entry.sent = this.now();
                return code;
            }
        if (this.pending.size >= 10)
            return null;
        const code = randomBytes(4).toString("hex").toUpperCase();
        this.pending.set(code, { user, chat, expires: this.now() + 600000, sent: this.now() });
        return code;
    }
    pair(code) {
        const entry = this.pending.get(code.toUpperCase());
        if (!entry || entry.expires < this.now())
            throw new Error("Pairing-Code ungültig oder abgelaufen. Erneut dem Bot schreiben.");
        this.state.users = [...new Set([...this.state.users, entry.user])];
        this.state.policy = "allowlist";
        this.pending.clear();
        this.save();
        return entry.chat;
    }
    policy(value) {
        if (!["pairing", "allowlist", "disabled"].includes(value))
            throw new Error("Policy: pairing, allowlist oder disabled.");
        this.state.policy = value;
        this.pending.clear();
        this.save();
    }
    revoke(user) { this.state.users = this.state.users.filter(id => id !== user); this.pending.clear(); this.save(); }
    acquire() {
        mkdirSync(this.dir, { recursive: true, mode: 0o700 });
        const path = join(this.dir, "session.lock"), owner = { pid: process.pid, nonce: randomBytes(16).toString("hex") };
        if (existsSync(path)) {
            const stat = lstatSync(path);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048)
                throw new Error("Ungültige Telegram-Sitzungssperre.");
            const current = JSON.parse(readFileSync(path, "utf8"));
            let alive = true;
            try {
                process.kill(current.pid, 0);
            }
            catch (error) {
                alive = error.code !== "ESRCH";
            }
            if (alive)
                throw new Error("Dieser Bot ist bereits mit einer lokalen Sitzung verbunden. Dort /telegram off verwenden.");
            unlinkSync(path);
        }
        writeFileSync(path, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
        return () => { try {
            const current = JSON.parse(readFileSync(path, "utf8"));
            if (current.nonce === owner.nonce)
                unlinkSync(path);
        }
        catch { } };
    }
}
//# sourceMappingURL=channel-access.js.map