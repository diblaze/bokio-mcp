import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    bokioRequest,
    cached,
    clearCache,
    downloadTarget,
    filterQuery,
    resolveCompanyId,
    tokenWarning,
    writesAllowed,
} from "../src/bokio.js";

describe("filterQuery", () => {
    it("returns undefined when nothing is given", () => {
        expect(filterQuery()).toBeUndefined();
    });

    it("builds date bounds", () => {
        expect(filterQuery("2026-07-01", "2026-07-31")).toBe("date>=2026-07-01&&date<=2026-07-31");
    });

    it("keeps a raw filter and appends bounds in order (Date bounds joined with &&)", () => {
        expect(filterQuery("2026-07-01", undefined, "title=rent")).toBe(
            "title=rent&&date>=2026-07-01",
        );
        expect(filterQuery(undefined, undefined, "title=rent")).toBe("title=rent");
    });
});

describe("error UX + token validation", () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
        vi.unstubAllGlobals();
    });

    it("tokenWarning flags unset, malformed, and accepts a plausible token", () => {
        delete process.env.BOKIO_TOKEN;
        expect(tokenWarning()).toMatch(/not set/);
        process.env.BOKIO_TOKEN = "short";
        expect(tokenWarning()).toMatch(/malformed/);
        process.env.BOKIO_TOKEN = "a".repeat(40);
        expect(tokenWarning()).toBeNull();
    });

    it("maps 401/403/404/429 to actionable hints (401, 403 and 429 hints name the documented causes)", async () => {
        const token = "a".repeat(40);
        process.env.BOKIO_TOKEN = token;
        for (const [status, re] of [
            [401, /Integrations/],
            [403, /quota/],
            [404, /verify the id/],
            [429, /rate limited/],
        ] as const) {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () => new Response("x", { status })),
            );
            const err = await bokioRequest({ path: "/x" }).catch((e: Error) => e);
            expect((err as Error).message).toMatch(re);
            expect((err as Error).message).not.toMatch(token);
        }
    });
});

function mockFetch(status: number, body: unknown, contentType = "application/json") {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return vi.fn(
        async () => new Response(text, { status, headers: { "content-type": contentType } }),
    );
}

describe("config", () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
        vi.unstubAllGlobals();
    });

    it("resolveCompanyId prefers arg then env", () => {
        process.env.BOKIO_COMPANY_ID = "env-co";
        expect(resolveCompanyId("arg-co")).toBe("arg-co");
        expect(resolveCompanyId()).toBe("env-co");
    });

    it("resolveCompanyId rejects ids that would change the URL path", () => {
        for (const bad of ["../x", "a/b", "a?b=c", ""]) {
            expect(() => resolveCompanyId(bad || "x/")).toThrow(/plain id/);
        }
    });

    it("resolveCompanyId throws when nothing set", () => {
        delete process.env.BOKIO_COMPANY_ID;
        expect(() => resolveCompanyId()).toThrow(/companyId required/);
    });

    it("writesAllowed reads the env gate", () => {
        delete process.env.BOKIO_ALLOW_WRITES;
        expect(writesAllowed()).toBe(false);
        process.env.BOKIO_ALLOW_WRITES = "1";
        expect(writesAllowed()).toBe(true);
        process.env.BOKIO_ALLOW_WRITES = "true";
        expect(writesAllowed()).toBe(true);
        process.env.BOKIO_ALLOW_WRITES = "no";
        expect(writesAllowed()).toBe(false);
    });
});

describe("downloadTarget", () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it("confines to the working directory when no download dir is set (Downloads stay in the working directory by default)", () => {
        delete process.env.BOKIO_DOWNLOAD_DIR;
        expect(downloadTarget("foo.sie")).toBe(resolve("foo.sie"));
        expect(() => downloadTarget("/etc/passwd")).toThrow(/working directory/);
        expect(() => downloadTarget("../escape.sie")).toThrow(/working directory/);
    });

    it("confines within BOKIO_DOWNLOAD_DIR", () => {
        process.env.BOKIO_DOWNLOAD_DIR = "/tmp/dl";
        expect(downloadTarget("a.sie")).toBe(resolve("/tmp/dl", "a.sie"));
        expect(downloadTarget("sub/a.sie")).toBe(resolve("/tmp/dl", "sub/a.sie"));
    });

    it("rejects path traversal out of BOKIO_DOWNLOAD_DIR", () => {
        process.env.BOKIO_DOWNLOAD_DIR = "/tmp/dl";
        expect(() => downloadTarget("../escape.sie")).toThrow(/escapes BOKIO_DOWNLOAD_DIR/);
        expect(() => downloadTarget("/etc/passwd")).toThrow(/escapes BOKIO_DOWNLOAD_DIR/);
    });
});

describe("bokioRequest", () => {
    const saved = { ...process.env };
    beforeEach(() => {
        process.env.BOKIO_TOKEN = "test-token";
    });
    afterEach(() => {
        process.env = { ...saved };
        vi.unstubAllGlobals();
    });

    it("GET sends Bearer auth and parses JSON", async () => {
        const f = mockFetch(200, { hello: "world" });
        vi.stubGlobal("fetch", f);
        const out = await bokioRequest<{ hello: string }>({ path: "/x" });
        expect(out.hello).toBe("world");
        const [url, init] = f.mock.calls[0];
        expect(String(url)).toContain("/x");
        expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
    });

    it("appends query params, skipping empty", async () => {
        const f = mockFetch(200, {});
        vi.stubGlobal("fetch", f);
        await bokioRequest({ path: "/j", query: { page: 2, pageSize: 100, query: undefined } });
        const url = String(f.mock.calls[0][0]);
        expect(url).toContain("page=2");
        expect(url).toContain("pageSize=100");
        expect(url).not.toContain("query=");
    });

    it("throws on non-2xx with status and body", async () => {
        vi.stubGlobal("fetch", mockFetch(404, { error: "nope" }));
        await expect(bokioRequest({ path: "/missing" })).rejects.toThrow(/404/);
    });

    it("blocks writes unless BOKIO_ALLOW_WRITES is set (Write request blocked at the client when gate off)", async () => {
        delete process.env.BOKIO_ALLOW_WRITES;
        const f = mockFetch(200, {});
        vi.stubGlobal("fetch", f);
        await expect(
            bokioRequest({ method: "POST", path: "/journal-entries", body: { items: [] } }),
        ).rejects.toThrow(/BOKIO_ALLOW_WRITES/);
        expect(f).not.toHaveBeenCalled();
    });

    it("allows writes when the gate is on", async () => {
        process.env.BOKIO_ALLOW_WRITES = "1";
        const f = mockFetch(200, { id: "je-1" });
        vi.stubGlobal("fetch", f);
        const out = await bokioRequest<{ id: string }>({
            method: "POST",
            path: "/journal-entries",
            body: { items: [] },
        });
        expect(out.id).toBe("je-1");
        expect((f.mock.calls[0][1] as RequestInit).method).toBe("POST");
    });

    it("throws a clear error when BOKIO_TOKEN is missing", async () => {
        delete process.env.BOKIO_TOKEN;
        vi.stubGlobal("fetch", mockFetch(200, {}));
        await expect(bokioRequest({ path: "/x" })).rejects.toThrow(/BOKIO_TOKEN not set/);
    });
});

describe("cache", () => {
    const saved = { ...process.env };
    beforeEach(() => {
        clearCache();
        process.env.BOKIO_TOKEN = "a".repeat(40);
        process.env.BOKIO_ALLOW_WRITES = "1";
    });
    afterEach(() => {
        process.env = { ...saved };
        vi.unstubAllGlobals();
    });
    const json = (status: number) =>
        vi.fn(
            async () =>
                new Response("{}", { status, headers: { "content-type": "application/json" } }),
        );

    it("cached reloads after a rejected load (Failed load is not cached)", async () => {
        const load = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce("ok");
        await expect(cached("k", load)).rejects.toThrow("boom");
        await expect(cached("k", load)).resolves.toBe("ok");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("successful write clears the cache (Successful write clears cached data)", async () => {
        const load = vi.fn(async () => "v");
        await cached("k", load);
        vi.stubGlobal("fetch", json(200));
        await bokioRequest({ path: "/x" });
        await cached("k", load);
        expect(load).toHaveBeenCalledTimes(1);
        await bokioRequest({ method: "POST", path: "/x" });
        await cached("k", load);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("blocked write leaves the cache (Blocked write leaves cached data)", async () => {
        const load = vi.fn(async () => "v");
        await cached("k", load);
        delete process.env.BOKIO_ALLOW_WRITES;
        const f = json(200);
        vi.stubGlobal("fetch", f);
        await expect(bokioRequest({ method: "POST", path: "/x" })).rejects.toThrow(/blocked/);
        await cached("k", load);
        expect(load).toHaveBeenCalledTimes(1);
        expect(f).not.toHaveBeenCalled();
    });

    it("load in flight across a write is not stored (Read in flight across a write is not reused)", async () => {
        let release: (v: string) => void = () => {};
        const slow = cached("k", () => new Promise<string>((r) => (release = r)));
        vi.stubGlobal("fetch", json(200));
        await bokioRequest({ method: "POST", path: "/x" });
        release("old");
        await expect(slow).resolves.toBe("old");
        const load = vi.fn(async () => "new");
        await expect(cached("k", load)).resolves.toBe("new");
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("parallel loads share one call (Parallel loads share one request)", async () => {
        let release: (v: string) => void = () => {};
        const load = vi.fn(() => new Promise<string>((r) => (release = r)));
        const both = Promise.all([cached("k", load), cached("k", load)]);
        release("v");
        await expect(both).resolves.toEqual(["v", "v"]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("failed write clears the cache (Failed write also clears cached data)", async () => {
        const load = vi.fn(async () => "v");
        await cached("k", load);
        vi.stubGlobal("fetch", json(500));
        await expect(bokioRequest({ method: "POST", path: "/x" })).rejects.toThrow(/500/);
        await cached("k", load);
        expect(load).toHaveBeenCalledTimes(2);
    });
});
