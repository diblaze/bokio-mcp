import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bokioRequest, resolveCompanyId, writesAllowed } from "../src/bokio.js";

function mockFetch(status: number, body: unknown, contentType = "application/json") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn(async () =>
    new Response(text, { status, headers: { "content-type": contentType } }),
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

  it("blocks writes unless BOKIO_ALLOW_WRITES is set", async () => {
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
