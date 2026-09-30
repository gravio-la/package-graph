import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { DOMAIN_VOCABULARY, GIT_WINDOW_MONTHS } from "../../config/rules";
import type { CodeMetrics, GitMetrics } from "../../src/types";
import { isTestFile } from "./workspace";

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
    } else if (entry !== "node_modules" && entry !== "dist") {
      walkFiles(full, acc);
    }
  }
  return acc;
}

export function computeCodeMetrics(folder: string): CodeMetrics {
  const srcDir = join(folder, "src");
  const files = existsSync(srcDir) ? walkFiles(srcDir) : walkFiles(folder);
  let loc = 0;
  let anyCount = 0;
  let tsIgnoreCount = 0;
  let eslintDisableCount = 0;
  let todoCount = 0;
  let commentLines = 0;
  let codeLines = 0;
  let testFiles = 0;
  let largestFile = { path: "", loc: 0 };
  const domainVocabHits: CodeMetrics["domainVocabHits"] = [];

  for (const file of files) {
    if (isTestFile(file)) {
      testFiles += 1;
      continue;
    }
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    let fileLoc = 0;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      fileLoc += 1;
      loc += 1;
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
        commentLines += 1;
      } else {
        codeLines += 1;
      }
      if (/\bany\b/.test(line)) anyCount += 1;
      if (/@ts-ignore|@ts-expect-error/.test(line)) tsIgnoreCount += 1;
      if (/eslint-disable/.test(line)) eslintDisableCount += 1;
      if (/TODO|FIXME|HACK/.test(line)) todoCount += 1;

      for (const term of DOMAIN_VOCABULARY) {
        if (line.includes(term)) {
          domainVocabHits.push({
            term,
            file: relative(folder, file),
            line: idx + 1,
          });
        }
      }
    });

    if (fileLoc > largestFile.loc) {
      largestFile = { path: relative(folder, file), loc: fileLoc };
    }
  }

  const nonTestFiles = files.filter((f) => !isTestFile(f)).length;
  return {
    loc,
    files: nonTestFiles,
    testFiles,
    testRatio: nonTestFiles > 0 ? testFiles / nonTestFiles : 0,
    largestFile,
    anyCount,
    tsIgnoreCount,
    eslintDisableCount,
    todoCount,
    commentDensity: codeLines > 0 ? commentLines / (codeLines + commentLines) : 0,
    domainVocabHits,
  };
}

export function computeGitMetrics(folder: string, repoRoot: string): GitMetrics {
  try {
    const since = `${GIT_WINDOW_MONTHS} months ago`;
    const rel = relative(repoRoot, folder);
    const log = execSync(
      `git log --since="${since}" --format=%H%n%an%n%s%n%B---END--- -- "${rel}"`,
      { encoding: "utf8", cwd: repoRoot },
    );
    const commits = log.split("---END---").filter((b) => b.trim());
    let aiCommits = 0;
    for (const block of commits) {
      if (/Co-Authored-By:.*(Claude|Copilot|Cursor|AI)/i.test(block)) {
        aiCommits += 1;
      }
    }
    const lastChange = execSync(`git log -1 --format=%cI -- "${rel}"`, {
      encoding: "utf8",
      cwd: repoRoot,
    }).trim();

    return {
      commits6mo: commits.length,
      lastChange: lastChange || null,
      aiCoauthorRatio: commits.length > 0 ? aiCommits / commits.length : 0,
    };
  } catch {
    return { commits6mo: 0, lastChange: null, aiCoauthorRatio: 0 };
  }
}
