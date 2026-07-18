import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const DEFAULT_BASE = "https://api.bokio.se/v1";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function baseUrl(): string {
  return (process.env.BOKIO_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
}

export function writesAllowed(): boolean {
  const v = (process.env.BOKIO_ALLOW_WRITES ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function resolveCompanyId(companyId?: string): string {
  const cid = companyId ?? process.env.BOKIO_COMPANY_ID;
  if (!cid) {
    throw new Error("companyId required: pass it or set BOKIO_COMPANY_ID");
  }
  return cid;
}

function token(): string {
  const t = process.env.BOKIO_TOKEN;
  if (!t) {
    throw new Error("BOKIO_TOKEN not set (Bokio -> Installningar -> API Tokens)");
  }
  return t;
}

export type Query = Record<string, string | number | undefined>;

export interface RequestOpts {
  method?: string;
  path: string;
  query?: Query;
  body?: unknown;
  form?: FormData;
}

function buildUrl(path: string, query?: Query): URL {
  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

/** JSON request. Enforces the write gate for mutating methods. */
export async function bokioRequest<T = unknown>(opts: RequestOpts): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  if (WRITE_METHODS.has(method) && !writesAllowed()) {
    throw new Error(
      `write blocked: ${method} ${opts.path} requires BOKIO_ALLOW_WRITES=1 ` +
        `(safety gate for live accounting data)`,
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token()}`,
    Accept: "application/json",
  };
  let bodyInit: string | FormData | undefined;
  if (opts.form) {
    bodyInit = opts.form; // fetch sets the multipart boundary itself
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(opts.body);
  }

  const res = await fetch(buildUrl(opts.path, opts.query), { method, headers, body: bodyInit });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Bokio ${method} ${opts.path} -> ${res.status} ${res.statusText}: ${text.slice(0, 600)}`,
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (text ? JSON.parse(text) : null) as T;
  }
  return text as unknown as T;
}

/** GET a binary/text file (e.g. SIE, invoice PDF, upload). No write gate (read). */
export async function bokioDownload(path: string, query?: Query): Promise<Buffer> {
  const res = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: { Authorization: `Bearer ${token()}`, Accept: "*/*" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bokio GET ${path} -> ${res.status} ${res.statusText}: ${text.slice(0, 600)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Build a multipart form for an upload endpoint (field name `file`). */
export async function fileForm(
  filePath: string,
  extra?: Record<string, string | undefined>,
): Promise<FormData> {
  const buf = await readFile(filePath);
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(buf)]), basename(filePath));
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v !== undefined && v !== "") fd.set(k, v);
  }
  return fd;
}
