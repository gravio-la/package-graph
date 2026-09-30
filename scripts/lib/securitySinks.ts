import ts from "typescript";
import { SECURITY_CLASSIFICATION, KNOWN_SANITIZERS } from "../../config/security";
import type { WorkspacePackage } from "./workspace";
import { isTestFile } from "./workspace";

export type SinkKind =
  | "sparql-template"
  | "iri-interpolation"
  | "literal-escaper"
  | "regex-injection"
  | "limit-offset"
  | "sql-raw"
  | "dynamic-orderby"
  | "html-dangerous"
  | "code-exec"
  | "prototype-pollution"
  | "ssrf-fetch";

export interface SecuritySink {
  file: string;
  line: number;
  kind: SinkKind;
  snippet: string;
  sanitized: boolean;
  sanitizer?: string;
}

export interface PackageSecurityReport {
  classification?: string;
  sinks: SecuritySink[];
  cveCount: number;
}

const SPARQL_KEYWORDS = /\b(SELECT|CONSTRUCT|WHERE|FILTER|REGEX|LIMIT|OFFSET)\b/i;

export function scanSecuritySinks(
  program: ts.Program,
  packages: WorkspacePackage[],
): Map<string, PackageSecurityReport> {
  const result = new Map<string, PackageSecurityReport>();

  for (const pkg of packages) {
    const classification = SECURITY_CLASSIFICATION[pkg.name];
    const sinks: SecuritySink[] = [];

    for (const sf of program.getSourceFiles()) {
      if (!sf.fileName.startsWith(pkg.folder + "/")) continue;
      if (isTestFile(sf.fileName)) continue;
      const rel = sf.fileName.replace(pkg.folder + "/", "");
      const lines = sf.text.split("\n");

      lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        const trimmed = line.trim();

        if (/`[^`]*\$\{[^}]+\}[^`]*`/.test(line) && SPARQL_KEYWORDS.test(line)) {
          sinks.push(sink(rel, lineNo, "sparql-template", trimmed, line));
        }
        if (/<\$\{[^}]+\}>/.test(line) || /`<\$\{/.test(line)) {
          sinks.push(sink(rel, lineNo, "iri-interpolation", trimmed, line));
        }
        if (/function\s+(escapeLiteral|escapeIri|sanitizeVariableName)/.test(line)) {
          sinks.push(sink(rel, lineNo, "literal-escaper", trimmed, line));
        }
        if (/REGEX\s*\(/.test(line) && /\$\{/.test(line)) {
          sinks.push(sink(rel, lineNo, "regex-injection", trimmed, line));
        }
        if (/\b(LIMIT|OFFSET)\b/.test(line) && /\$\{/.test(line) && !/^\s*\/\//.test(line)) {
          sinks.push(sink(rel, lineNo, "limit-offset", trimmed, line));
        }
        if (/\$queryRawUnsafe|\$executeRawUnsafe/.test(line)) {
          sinks.push(sink(rel, lineNo, "sql-raw", trimmed, line));
        }
        if (/orderBy.*\[/.test(line) && /\$\{|\[.*\+/.test(line)) {
          sinks.push(sink(rel, lineNo, "dynamic-orderby", trimmed, line));
        }
        if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(line)) {
          sinks.push(sink(rel, lineNo, "html-dangerous", trimmed, line));
        }
        if (/\beval\s*\(|new\s+Function\s*\(|new\s+RegExp\s*\(\s*[^'"`]/.test(line)) {
          sinks.push(sink(rel, lineNo, "code-exec", trimmed, line));
        }
        if (/\b(set|merge|setWith)\s*\(/.test(line) && /\$\{|\[.*\]/.test(line)) {
          sinks.push(sink(rel, lineNo, "prototype-pollution", trimmed, line));
        }
        if (/\bfetch\s*\(/.test(line) && /\$\{|`[^`]*\+/.test(line)) {
          sinks.push(sink(rel, lineNo, "ssrf-fetch", trimmed, line));
        }
      });
    }

    if (classification || sinks.length) {
      result.set(pkg.name, { classification, sinks, cveCount: 0 });
    }
  }

  return result;
}

function sink(
  file: string,
  line: number,
  kind: SinkKind,
  snippet: string,
  fullLine: string,
): SecuritySink {
  const sanitizer = KNOWN_SANITIZERS.find((s) => fullLine.includes(s));
  return {
    file,
    line,
    kind,
    snippet: snippet.slice(0, 120),
    sanitized: !!sanitizer,
    sanitizer,
  };
}

export function runBunAudit(repoRoot: string): Map<string, number> {
  const cveByPackage = new Map<string, number>();
  try {
    const proc = Bun.spawnSync(["bun", "audit", "--json"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : "{}";
    const parsed = JSON.parse(stdout) as {
      advisories?: Record<string, { module_name: string }>;
    };
    for (const adv of Object.values(parsed.advisories ?? {})) {
      const mod = adv.module_name;
      cveByPackage.set(mod, (cveByPackage.get(mod) ?? 0) + 1);
    }
  } catch {
    /* audit unavailable */
  }
  return cveByPackage;
}
