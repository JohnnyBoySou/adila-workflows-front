/**
 * Painel dedicado para o nó `http_request`. Substitui o renderer genérico
 * por uma UI rica em sidebar+conteúdo, com seções: Request, Headers,
 * Query params, Body (multi-modo), Autenticação e Avançado.
 *
 * Shape escrito em `values` (extensão do schema atual — o backend precisa
 * acompanhar para os campos novos serem efetivos):
 *
 *   url, method, headers (kv), queryParams (kv),
 *   body: { mode: "json"|"form"|"raw"|"multipart", content, rawContentType? },
 *   auth: { type, ...campos por tipo },
 *   timeoutMs, retry: { count, delayMs }, followRedirects, skipSslVerify, proxy
 */
import { ClipboardPaste, Globe, KeyRound, ListChecks, Loader2, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

import { KeyValueEditor } from "./fields";
import { parseCurlCommand, type ParsedCurl, type ParsedCurlAuth } from "./parse-curl";
import type { CustomPanelProps } from "./types";

/* -------------------------------------------------------------------------- */
/* Tipos do painel                                                             */
/* -------------------------------------------------------------------------- */

type BodyMode = "json" | "form" | "raw" | "multipart";
type AuthType = "none" | "basic" | "bearer" | "api_key" | "oauth2";

interface BodyValue {
  mode: BodyMode;
  content?: unknown;
  rawContentType?: string;
}

interface AuthValue {
  type: AuthType;
  username?: string;
  password?: string;
  token?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: "header" | "query";
  oauthToken?: string;
}

interface RetryValue {
  count: number;
  delayMs?: number;
}

/* -------------------------------------------------------------------------- */
/* Constantes                                                                  */
/* -------------------------------------------------------------------------- */

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
const NO_BODY_METHODS = new Set(["GET", "HEAD"]);

const BASE_SECTIONS = [
  { id: "request", label: "Request", icon: Globe },
  { id: "headers", label: "Headers", icon: ListChecks },
  { id: "body", label: "Body", icon: ListChecks },
  { id: "auth", label: "Autenticação", icon: KeyRound },
  { id: "advanced", label: "Avançado", icon: Settings2 },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof BASE_SECTIONS)[number]["id"];

/* -------------------------------------------------------------------------- */
/* Helpers de leitura/escrita                                                  */
/* -------------------------------------------------------------------------- */

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function readNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function readBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function readBody(v: unknown): BodyValue {
  if (v && typeof v === "object" && "mode" in v) return v as BodyValue;
  return { mode: "json" };
}

function readAuth(v: unknown): AuthValue {
  if (v && typeof v === "object" && "type" in v) return v as AuthValue;
  return { type: "none" };
}

function readRetry(v: unknown): RetryValue {
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    return {
      count: typeof r.count === "number" ? r.count : 0,
      ...(typeof r.delayMs === "number" && { delayMs: r.delayMs }),
    };
  }
  return { count: 0 };
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function HttpRequestPanel({ values, onChange, onError }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("request");

  const url = readString(values.url);
  const method = readString(values.method, "GET");
  const body = useMemo(() => readBody(values.body), [values.body]);
  const auth = useMemo(() => readAuth(values.auth), [values.auth]);

  // Validação básica — URL obrigatório. O dialog usa `onError` pra travar
  // o Salvar enquanto houver pendência.
  useEffect(() => {
    onError?.("url", url.trim() === "" ? "Informe a URL." : null);
  }, [url, onError]);

  function set(key: string, value: unknown) {
    onChange({ [key]: value });
  }

  function setBody(patch: Partial<BodyValue>) {
    const next: BodyValue = { ...body, ...patch };
    onChange({ body: next });
  }

  function setAuth(patch: Partial<AuthValue>) {
    const next: AuthValue = { ...auth, ...patch };
    // type="none" zera campos sensíveis pra não vazar no save.
    if (next.type === "none") {
      onChange({ auth: { type: "none" } });
      return;
    }
    onChange({ auth: next });
  }

  function applyCurlImport(parsed: ParsedCurl) {
    const patch: Record<string, unknown> = {
      url: parsed.url,
      method: parsed.method,
      headers: Object.keys(parsed.headers).length > 0 ? parsed.headers : undefined,
      queryParams: Object.keys(parsed.queryParams).length > 0 ? parsed.queryParams : undefined,
    };
    if (parsed.body) patch.body = parsed.body;
    if (parsed.auth) patch.auth = mapParsedAuth(parsed.auth);
    if (parsed.skipSslVerify) patch.skipSslVerify = true;
    onChange(patch);
  }

  // Body é desabilitado (mas ainda navegável) quando o método não envia body.
  // Marcamos com `disabled` pra opacidade + `disabledReason` pro tooltip.
  const sections = useMemo<SectionItem<SectionId>[]>(
    () =>
      BASE_SECTIONS.map((s) =>
        s.id === "body" && NO_BODY_METHODS.has(method)
          ? { ...s, disabled: true, disabledReason: `${method} não envia body` }
          : { ...s },
      ),
    [method],
  );

  return (
    <Sections
      sections={sections}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções de configuração HTTP"
    >
      {section === "request" && (
        <RequestSection
          url={url}
          method={method}
          queryParams={values.queryParams}
          onUrlChange={(v) => set("url", v)}
          onMethodChange={(v) => set("method", v)}
          onQueryParamsChange={(v) => set("queryParams", v)}
          onImportCurl={applyCurlImport}
        />
      )}
      {section === "headers" && (
        <HeadersSection headers={values.headers} onChange={(v) => set("headers", v)} />
      )}
      {section === "body" && <BodySection method={method} body={body} onChange={setBody} />}
      {section === "auth" && <AuthSection auth={auth} onChange={setAuth} />}
      {section === "advanced" && (
        <AdvancedSection
          timeoutMs={readNumber(values.timeoutMs)}
          retry={readRetry(values.retry)}
          followRedirects={readBool(values.followRedirects)}
          skipSslVerify={readBool(values.skipSslVerify)}
          proxy={readString(values.proxy)}
          onChange={(patch) => onChange(patch)}
        />
      )}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Seções                                                                      */
/* -------------------------------------------------------------------------- */

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FieldGroup({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RequestSection({
  url,
  method,
  queryParams,
  onUrlChange,
  onMethodChange,
  onQueryParamsChange,
  onImportCurl,
}: {
  url: string;
  method: string;
  queryParams: unknown;
  onUrlChange: (v: string) => void;
  onMethodChange: (v: string) => void;
  onQueryParamsChange: (v: unknown) => void;
  onImportCurl: (parsed: ParsedCurl) => void;
}) {
  const [curlDialogOpen, setCurlDialogOpen] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Request</h3>
          <p className="text-xs text-muted-foreground">Método, URL e query parameters.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setCurlDialogOpen(true)}
        >
          <ClipboardPaste className="size-4" />
          Importar curl
        </Button>
      </div>

      <CurlImportDialog
        open={curlDialogOpen}
        onOpenChange={setCurlDialogOpen}
        onImport={(parsed) => {
          onImportCurl(parsed);
          setCurlDialogOpen(false);
        }}
      />

      <div className="mb-4 flex items-stretch gap-2">
        <Select value={method} onValueChange={onMethodChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://api.exemplo.com/recurso"
          className="flex-1"
          spellCheck={false}
        />
      </div>

      <FieldGroup label="Query params" hint="Anexados à URL como ?k=v. Aceita templates {{ … }}.">
        <KeyValueEditor value={queryParams} onChange={onQueryParamsChange} />
      </FieldGroup>
    </div>
  );
}

function HeadersSection({
  headers,
  onChange,
}: {
  headers: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div>
      <SectionHeader
        title="Headers"
        hint="Headers extras de request. Auth e Content-Type podem ser sobrescritos."
      />
      <KeyValueEditor value={headers} onChange={onChange} />
    </div>
  );
}

function BodySection({
  method,
  body,
  onChange,
}: {
  method: string;
  body: BodyValue;
  onChange: (patch: Partial<BodyValue>) => void;
}) {
  if (NO_BODY_METHODS.has(method)) {
    return (
      <div>
        <SectionHeader title="Body" />
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
          {method} não envia body. Troque o método em Request pra habilitar.
        </p>
      </div>
    );
  }

  const modes: { id: BodyMode; label: string; hint: string }[] = [
    { id: "json", label: "JSON", hint: "Content-Type: application/json" },
    { id: "form", label: "Form (urlencoded)", hint: "application/x-www-form-urlencoded" },
    { id: "raw", label: "Raw", hint: "Conteúdo cru — você define o Content-Type" },
    { id: "multipart", label: "Multipart", hint: "multipart/form-data (kv com strings/arquivos)" },
  ];

  return (
    <div>
      <SectionHeader title="Body" hint={modes.find((m) => m.id === body.mode)?.hint} />

      <div role="tablist" aria-label="Modo do body" className="mb-4 flex flex-wrap gap-1">
        {modes.map((m) => {
          const active = body.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ mode: m.id, content: undefined })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {body.mode === "json" && (
        <FieldGroup label="JSON body" hint="Objeto ou array — serializado automaticamente.">
          <Textarea
            value={
              body.content === undefined
                ? ""
                : typeof body.content === "string"
                  ? body.content
                  : safeStringify(body.content)
            }
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder={'{\n  "name": "{{ input.name }}"\n}'}
            rows={10}
            spellCheck={false}
            className="font-mono text-xs"
          />
        </FieldGroup>
      )}

      {body.mode === "form" && (
        <FieldGroup label="Campos do form" hint="Codificados como application/x-www-form-urlencoded.">
          <KeyValueEditor value={body.content} onChange={(v) => onChange({ content: v })} />
        </FieldGroup>
      )}

      {body.mode === "raw" && (
        <>
          <FieldGroup label="Content-Type">
            <Input
              value={body.rawContentType ?? ""}
              onChange={(e) => onChange({ rawContentType: e.target.value })}
              placeholder="text/plain"
            />
          </FieldGroup>
          <FieldGroup label="Conteúdo">
            <Textarea
              value={readString(body.content)}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={10}
              spellCheck={false}
              className="font-mono text-xs"
            />
          </FieldGroup>
        </>
      )}

      {body.mode === "multipart" && (
        <FieldGroup
          label="Partes (chave / valor)"
          hint="Valores em forma de string. Arquivos via template — ex.: {{ steps.upload.file }}."
        >
          <KeyValueEditor value={body.content} onChange={(v) => onChange({ content: v })} />
        </FieldGroup>
      )}
    </div>
  );
}

function AuthSection({
  auth,
  onChange,
}: {
  auth: AuthValue;
  onChange: (patch: Partial<AuthValue>) => void;
}) {
  const types: { id: AuthType; label: string }[] = [
    { id: "none", label: "Nenhuma" },
    { id: "basic", label: "Basic" },
    { id: "bearer", label: "Bearer token" },
    { id: "api_key", label: "API key" },
    { id: "oauth2", label: "OAuth2 (token)" },
  ];

  return (
    <div>
      <SectionHeader
        title="Autenticação"
        hint="Os headers são montados automaticamente — você pode sobrescrever em Headers."
      />

      <FieldGroup label="Tipo">
        <Select value={auth.type} onValueChange={(v) => onChange({ type: v as AuthType })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldGroup>

      {auth.type === "basic" && (
        <>
          <FieldGroup label="Usuário">
            <Input
              value={auth.username ?? ""}
              onChange={(e) => onChange({ username: e.target.value })}
              placeholder="usuario"
            />
          </FieldGroup>
          <FieldGroup label="Senha">
            <Input
              type="password"
              value={auth.password ?? ""}
              onChange={(e) => onChange({ password: e.target.value })}
              placeholder="••••••"
              autoComplete="new-password"
            />
          </FieldGroup>
        </>
      )}

      {auth.type === "bearer" && (
        <FieldGroup label="Token" hint='Vira "Authorization: Bearer <token>".'>
          <Input
            value={auth.token ?? ""}
            onChange={(e) => onChange({ token: e.target.value })}
            placeholder="{{ env.API_TOKEN }}"
            spellCheck={false}
          />
        </FieldGroup>
      )}

      {auth.type === "api_key" && (
        <>
          <FieldGroup label="Nome do parâmetro">
            <Input
              value={auth.apiKeyName ?? ""}
              onChange={(e) => onChange({ apiKeyName: e.target.value })}
              placeholder="X-API-Key"
            />
          </FieldGroup>
          <FieldGroup label="Valor">
            <Input
              value={auth.apiKeyValue ?? ""}
              onChange={(e) => onChange({ apiKeyValue: e.target.value })}
              placeholder="{{ env.API_KEY }}"
              spellCheck={false}
            />
          </FieldGroup>
          <FieldGroup label="Enviar em">
            <Select
              value={auth.apiKeyIn ?? "header"}
              onValueChange={(v) => onChange({ apiKeyIn: v as "header" | "query" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query string</SelectItem>
              </SelectContent>
            </Select>
          </FieldGroup>
        </>
      )}

      {auth.type === "oauth2" && (
        <FieldGroup
          label="Access token"
          hint="Por enquanto aceita só o token pronto — flow OAuth2 completo virá depois."
        >
          <Input
            value={auth.oauthToken ?? ""}
            onChange={(e) => onChange({ oauthToken: e.target.value })}
            placeholder="{{ env.OAUTH_TOKEN }}"
            spellCheck={false}
          />
        </FieldGroup>
      )}
    </div>
  );
}

function AdvancedSection({
  timeoutMs,
  retry,
  followRedirects,
  skipSslVerify,
  proxy,
  onChange,
}: {
  timeoutMs: number | undefined;
  retry: RetryValue;
  followRedirects: boolean | undefined;
  skipSslVerify: boolean | undefined;
  proxy: string;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <SectionHeader title="Avançado" hint="Comportamento da requisição." />

      <FieldGroup label="Timeout (ms)" hint="Default 10000.">
        <Input
          type="number"
          min={0}
          value={timeoutMs ?? ""}
          onChange={(e) =>
            onChange({ timeoutMs: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          placeholder="10000"
        />
      </FieldGroup>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <FieldGroup label="Retries" hint="Tentativas em caso de erro 5xx/timeout.">
          <Input
            type="number"
            min={0}
            max={10}
            value={retry.count || ""}
            onChange={(e) =>
              onChange({
                retry: { ...retry, count: e.target.value === "" ? 0 : Number(e.target.value) },
              })
            }
            placeholder="0"
          />
        </FieldGroup>
        <FieldGroup label="Delay entre retries (ms)">
          <Input
            type="number"
            min={0}
            value={retry.delayMs ?? ""}
            onChange={(e) =>
              onChange({
                retry: {
                  ...retry,
                  delayMs: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
            placeholder="500"
          />
        </FieldGroup>
      </div>

      <ToggleRow
        label="Seguir redirects (3xx)"
        checked={followRedirects ?? true}
        onChange={(v) => onChange({ followRedirects: v })}
      />
      <ToggleRow
        label="Pular verificação SSL"
        hint="Não recomendado — só em ambientes internos."
        checked={skipSslVerify ?? false}
        onChange={(v) => onChange({ skipSslVerify: v })}
        warning={skipSslVerify === true}
      />

      <FieldGroup label="Proxy" hint="URL completa do proxy HTTP (opcional).">
        <Input
          value={proxy}
          onChange={(e) => onChange({ proxy: e.target.value === "" ? undefined : e.target.value })}
          placeholder="http://proxy.interno:8080"
        />
      </FieldGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pequenos building blocks                                                    */
/* -------------------------------------------------------------------------- */

function ToggleRow({
  label,
  hint,
  checked,
  warning,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  warning?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-4 flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-input"
      />
      <span className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-sm">
          {warning && <ShieldCheck className="size-3.5 text-amber-500" />}
          {label}
        </span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function mapParsedAuth(auth: ParsedCurlAuth): AuthValue {
  switch (auth.type) {
    case "basic":
      return { type: "basic", username: auth.username, password: auth.password };
    case "bearer":
      return { type: "bearer", token: auth.token };
    case "api_key":
      return {
        type: "api_key",
        apiKeyName: auth.apiKeyName,
        apiKeyValue: auth.apiKeyValue,
        apiKeyIn: auth.apiKeyIn,
      };
    default:
      return { type: "none" };
  }
}

function CurlImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (parsed: ParsedCurl) => void;
}) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setRaw("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  function handleImport() {
    setLoading(true);
    setError(null);
    const result = parseCurlCommand(raw);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onImport(result.data);
  }

  return (
    <Dialog open={open} onOpenChange={loading ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar curl</DialogTitle>
          <DialogDescription>
            Cole um comando copiado do terminal, Postman ou do DevTools. Método, URL, headers, body e
            autenticação básica/Bearer serão preenchidos automaticamente.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            if (error) setError(null);
          }}
          placeholder={`curl -X POST 'https://api.exemplo.com/users' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"Ada"}'`}
          rows={12}
          spellCheck={false}
          className="font-mono text-xs"
          disabled={loading}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleImport} disabled={loading || raw.trim() === ""}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
