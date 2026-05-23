/**
 * Parser leve de comandos `curl` para preencher o painel HTTP.
 * Cobre os casos mais comuns exportados por navegador, Postman e Insomnia.
 */

type BodyMode = "json" | "form" | "raw" | "multipart";

export type ParsedCurlBody = {
  mode: BodyMode;
  content?: unknown;
  rawContentType?: string;
};

export type ParsedCurlAuth =
  | { type: "none" }
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string }
  | { type: "api_key"; apiKeyName: string; apiKeyValue: string; apiKeyIn: "header" | "query" };

export type ParsedCurl = {
  url: string;
  method: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: ParsedCurlBody;
  auth?: ParsedCurlAuth;
  skipSslVerify?: boolean;
};

export type ParseCurlResult = { ok: true; data: ParsedCurl } | { ok: false; error: string };

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

export function parseCurlCommand(raw: string): ParseCurlResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Cole um comando curl." };

  const normalized = normalizeMultiline(input);
  if (!/^curl\b/i.test(normalized)) {
    return { ok: false, error: "O texto deve começar com curl." };
  }

  let tokens: string[];
  try {
    tokens = tokenize(normalized.replace(/^curl\s+/i, ""));
  } catch {
    return { ok: false, error: "Não foi possível interpretar o comando." };
  }

  let method = "GET";
  let url = "";
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  let useGetWithQuery = false;
  let basicAuth: { user: string; pass: string } | null = null;
  let skipSslVerify = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = () => tokens[++i];

    if (t === "-G" || t === "--get") {
      useGetWithQuery = true;
      continue;
    }
    if (t === "-k" || t === "--insecure") {
      skipSslVerify = true;
      continue;
    }
    if (t === "-X" || t === "--request") {
      const m = next()?.toUpperCase();
      if (m && METHODS.has(m)) method = m;
      continue;
    }
    if (t === "-H" || t === "--header") {
      const h = next();
      if (h) parseHeader(h, headers);
      continue;
    }
    if (
      t === "-d" ||
      t === "--data" ||
      t === "--data-raw" ||
      t === "--data-binary" ||
      t === "--data-urlencode"
    ) {
      const d = next();
      if (d) dataParts.push(d);
      continue;
    }
    if (t === "-u" || t === "--user") {
      const u = next();
      if (u) basicAuth = parseBasicUser(u);
      continue;
    }
    if (t === "--url") {
      const u = next();
      if (u) url = u;
      continue;
    }
    if (t === "-F" || t === "--form") {
      const f = next();
      if (f) {
        if (!headers["Content-Type"]?.includes("multipart")) {
          headers["Content-Type"] = "multipart/form-data";
        }
        dataParts.push(`__form__:${f}`);
      }
      continue;
    }
    if (t.startsWith("-")) continue;

    if (!url && looksLikeUrl(t)) url = t;
  }

  if (!url) return { ok: false, error: "URL não encontrada no comando." };

  const { base: urlBase, query: urlQuery } = splitUrl(url);
  const queryParams = { ...urlQuery };

  if (useGetWithQuery && dataParts.length > 0) {
    for (const part of dataParts) {
      if (part.startsWith("__form__:")) continue;
      const eq = part.indexOf("=");
      if (eq === -1) queryParams[part] = "";
      else queryParams[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    }
  }

  let auth: ParsedCurlAuth | undefined;
  const authHeader = headers.Authorization ?? headers.authorization;
  if (authHeader) {
    const parsed = parseAuthorizationHeader(authHeader);
    if (parsed) auth = parsed;
    delete headers.Authorization;
    delete headers.authorization;
  } else if (basicAuth) {
    auth = {
      type: "basic",
      username: basicAuth.user,
      password: basicAuth.pass,
    };
  }

  let body: ParsedCurlBody | undefined;
  if (dataParts.length > 0) {
    if (useGetWithQuery) {
      // -G: dados viram query string (já mesclados em queryParams).
    } else if (method === "GET" || method === "HEAD") {
      method = "POST";
      body = buildBody(dataParts, headers);
    } else {
      body = buildBody(dataParts, headers);
    }
  }

  const contentType = (
    headers["Content-Type"] ??
    headers["content-type"] ??
    ""
  ).toLowerCase();
  if (body && contentType.includes("application/json")) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  return {
    ok: true,
    data: {
      url: urlBase,
      method,
      headers,
      queryParams,
      ...(body && { body }),
      ...(auth && auth.type !== "none" && { auth }),
      ...(skipSslVerify && { skipSslVerify }),
    },
  };
}

function normalizeMultiline(input: string): string {
  return input
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (i >= input.length) break;

    const ch = input[i]!;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      let value = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          i++;
          value += input[i]!;
          i++;
        } else {
          value += input[i]!;
          i++;
        }
      }
      if (input[i] === quote) i++;
      tokens.push(value);
      continue;
    }

    let value = "";
    while (i < input.length && !/\s/.test(input[i]!)) {
      value += input[i]!;
      i++;
    }
    tokens.push(value);
  }
  return tokens;
}

function looksLikeUrl(t: string): boolean {
  return /^https?:\/\//i.test(t) || t.startsWith("{{");
}

function parseHeader(raw: string, headers: Record<string, string>) {
  const idx = raw.indexOf(":");
  if (idx === -1) return;
  const name = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (name) headers[name] = value;
}

function parseBasicUser(raw: string): { user: string; pass: string } {
  const idx = raw.indexOf(":");
  if (idx === -1) return { user: raw, pass: "" };
  return { user: raw.slice(0, idx), pass: raw.slice(idx + 1) };
}

function parseAuthorizationHeader(value: string): ParsedCurlAuth | undefined {
  const bearer = /^Bearer\s+(.+)$/i.exec(value);
  if (bearer) return { type: "bearer", token: bearer[1]!.trim() };

  const basic = /^Basic\s+(.+)$/i.exec(value);
  if (basic) {
    try {
      const decoded = atob(basic[1]!.trim());
      const colon = decoded.indexOf(":");
      if (colon === -1) return { type: "basic", username: decoded, password: "" };
      return {
        type: "basic",
        username: decoded.slice(0, colon),
        password: decoded.slice(colon + 1),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function splitUrl(url: string): { base: string; query: Record<string, string> } {
  const query: Record<string, string> = {};
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    u.search = "";
    u.hash = "";
    return { base: u.toString(), query };
  } catch {
    const q = url.indexOf("?");
    if (q === -1) return { base: url, query };
    const base = url.slice(0, q);
    const qs = url.slice(q + 1);
    for (const pair of qs.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq === -1) query[decodeURIComponent(pair)] = "";
      else {
        query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      }
    }
    return { base, query };
  }
}

function buildBody(dataParts: string[], headers: Record<string, string>): ParsedCurlBody {
  const formFields = dataParts.filter((p) => p.startsWith("__form__:"));
  if (formFields.length > 0) {
    const content: Record<string, string> = {};
    for (const f of formFields) {
      const raw = f.slice("__form__:".length);
      const eq = raw.indexOf("=");
      if (eq === -1) content[raw] = "";
      else content[raw.slice(0, eq)] = raw.slice(eq + 1);
    }
    return { mode: "multipart", content };
  }

  const joined = dataParts.join("&");
  const contentType = (
    headers["Content-Type"] ??
    headers["content-type"] ??
    ""
  ).toLowerCase();

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const content: Record<string, string> = {};
    for (const pair of joined.split("&")) {
      const eq = pair.indexOf("=");
      if (eq === -1) content[decodeURIComponent(pair)] = "";
      else {
        content[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      }
    }
    delete headers["Content-Type"];
    delete headers["content-type"];
    return { mode: "form", content };
  }

  if (contentType.includes("application/json") || looksLikeJson(joined)) {
    delete headers["Content-Type"];
    delete headers["content-type"];
    try {
      return { mode: "json", content: JSON.parse(joined) };
    } catch {
      return { mode: "json", content: joined };
    }
  }

  const rawType =
    headers["Content-Type"] ?? headers["content-type"] ?? "text/plain";
  delete headers["Content-Type"];
  delete headers["content-type"];
  return { mode: "raw", content: joined, rawContentType: rawType };
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}
