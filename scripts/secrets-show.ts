#!/usr/bin/env bun
// Mostra todas as env vars que vão para o container em prod, em formato legível.
// Junta env.clear (committed) + env.secret de TODOS os roles e accessories.
// Valores secret resolvidos por `.kamal/secrets`. Por defeito mascarados.
//
// Uso:
//   bun run secrets:show              # mascarado
//   bun run secrets:show --reveal     # plaintext

import { $ } from "bun";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const KAMAL_YML = `${REPO_ROOT}/infra/live/kamal/deploy.yml`;
const SECRETS_SH = `${REPO_ROOT}/.kamal/secrets`;
const REVEAL = process.argv.includes("--reveal");

const tty = process.stdout.isTTY;
const c = {
  bold: tty ? "\x1b[1m" : "",
  dim: tty ? "\x1b[2m" : "",
  red: tty ? "\x1b[31m" : "",
  grn: tty ? "\x1b[32m" : "",
  yel: tty ? "\x1b[33m" : "",
  cya: tty ? "\x1b[36m" : "",
  rst: tty ? "\x1b[0m" : "",
};

function mask(v: string): string {
  if (REVEAL) return v;
  const n = v.length;
  if (n <= 8) return "•".repeat(n);
  return `${v.slice(0, 4)}${"•".repeat(n - 8)}${v.slice(-4)} ${c.dim}(${n} chars)${c.rst}`;
}

// 1. Parse YAML
const yaml = Bun.YAML.parse(await Bun.file(KAMAL_YML).text()) as any;
const clearEnv: Record<string, string> = yaml.env?.clear ?? {};
const webSecrets: string[] = yaml.env?.secret ?? [];
const accessorySecrets: Record<string, string[]> = {};
for (const [name, def] of Object.entries(yaml.accessories ?? {})) {
  const d = def as any;
  if (d?.env?.secret?.length) accessorySecrets[name] = d.env.secret;
}

// 2. Resolver .kamal/secrets numa subshell com env mínima. Diff antes/depois
// isola exactamente o que `.kamal/secrets` injectou (ignora ruído do Mac).
const PRESERVE = ["HOME", "PATH", "USER"] as const;
const cleanEnv: Record<string, string> = {};
for (const k of PRESERVE) if (process.env[k]) cleanEnv[k] = process.env[k]!;

const spawnEnv = async (script: string): Promise<Map<string, string>> => {
  const p = Bun.spawn(["bash", "-c", script], { env: cleanEnv, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  const m = new Map<string, string>();
  for (const line of out.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) m.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return m;
};

const beforeEnv = await spawnEnv("env");
const afterEnv = await spawnEnv(`set -a; source "${SECRETS_SH}"; set +a; env`);
const resolved: Record<string, string> = {};
for (const [k, v] of afterEnv) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(k)) continue;
  if (beforeEnv.get(k) === v) continue;
  resolved[k] = v;
}

// 3. Header helpers
const hdr = (s: string) => console.log(`\n${c.bold}${s}${c.rst}`);
const row = (k: string, v: string) => console.log(`  ${k.padEnd(36)} ${v}`);

// 4. env.clear
hdr("env.clear (committed, plaintext, web role)");
for (const k of Object.keys(clearEnv).sort()) {
  row(`${c.cya}${k}${c.rst}`, String(clearEnv[k]));
}

// 5. env.secret — web
hdr("env.secret — web role");
for (const k of [...webSecrets].sort()) {
  const v = resolved[k];
  if (v) row(`${c.grn}${k}${c.rst}`, mask(v));
  else row(`${c.red}${k}${c.rst}`, `${c.red}<MISSING — .kamal/secrets não resolveu>${c.rst}`);
}

// 6. env.secret — accessories
for (const acc of Object.keys(accessorySecrets).sort()) {
  hdr(`env.secret — accessory: ${acc}`);
  for (const k of [...accessorySecrets[acc]].sort()) {
    const v = resolved[k];
    if (v) row(`${c.grn}${k}${c.rst}`, mask(v));
    else row(`${c.red}${k}${c.rst}`, `${c.red}<MISSING>${c.rst}`);
  }
}

// 7. Kamal-internal (não em deploy.yml mas exigido pelo Kamal)
hdr("Kamal-internal (registry auth)");
const kamalKey = "KAMAL_REGISTRY_PASSWORD";
if (resolved[kamalKey]) row(`${c.grn}${kamalKey}${c.rst}`, mask(resolved[kamalKey]));
else row(`${c.red}${kamalKey}${c.rst}`, `${c.red}<MISSING>${c.rst}`);

// 8. Resolvidos mas não usados (sanity check)
const declared = new Set<string>([
  ...webSecrets,
  ...Object.values(accessorySecrets).flat(),
  kamalKey,
]);
const TRANSIT = new Set(["SOPS_AGE_KEY_FILE", "SOPS_FILE"]); // exportados pelo próprio .kamal/secrets, não vão ao container
const orphans = Object.keys(resolved)
  .filter((k) => !declared.has(k) && !TRANSIT.has(k))
  .sort();
if (orphans.length) {
  hdr(`${c.dim}Resolvidos mas não declarados em deploy.yml (orphans)${c.rst}`);
  for (const k of orphans) row(`${c.dim}${k}${c.rst}`, mask(resolved[k]));
}

if (!REVEAL) {
  console.log(`\n${c.dim}Tip:${c.rst} ${c.bold}bun run secrets:show --reveal${c.rst} para ver valores em plaintext.`);
}
