/**
 * Automated checks of a proof written by a researcher or an AI (plan, Section 5.2):
 *
 * - the proof file proves the generated statement, by name, without restating it;
 * - the proof file cannot change what the statement means: no axioms, no `opaque` or
 *   `implemented_by`, no new syntax (notations, macros, elaborators), no `sorry`, `admit` or
 *   `native_decide`. Auxiliary definitions are allowed: the statement is a constant of the
 *   generated model file, which Lean forbids to redefine, and the check below pins its type;
 * - `#print axioms` shows only `propext`, `Classical.choice` and `Quot.sound`.
 *
 *   npx tsx packages/lean-gen/src/check-proofs.ts Examples.CautiousPair nonVacuity:NonVacuity
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A theorem of the proof file, and the generated statement it must prove (none for a lemma about the model). */
export type Claim = { theorem: string; statement?: string };

export type ProofCheck = { ok: boolean; problems: string[]; axioms: Record<string, string[]> };

const ALLOWED_AXIOMS = new Set(['propext', 'Classical.choice', 'Quot.sound']);

/** Commands a proof file may not contain. */
const FORBIDDEN = [
  /^\s*(?:@\[[^\]]*\]\s*)?(?:private\s+|protected\s+|noncomputable\s+|partial\s+|unsafe\s+)*(axiom|opaque|notation|infix|infixl|infixr|prefix|postfix|macro|macro_rules|syntax|elab|elab_rules|declare_syntax_cat|initialize|builtin_initialize)\b/m,
  /\bsorry\b/, /\badmit\b/, /\bnative_decide\b/, /implemented_by/, /\bextern\b/, /\bunsafe\b/,
];

function stripComments(src: string): string {
  return src.replace(/\/-[^]*?-\//g, '').replace(/--.*$/gm, '');
}

export function checkProofFile(source: string): string[] {
  const text = stripComments(source);
  const problems: string[] = [];
  for (const re of FORBIDDEN) {
    const m = text.match(re);
    if (m) problems.push(`the proof file contains \`${m[0].trim()}\``);
  }
  return problems;
}

/** Checks the claims of a module `<Module>.Proofs` against `<Module>.Model`. */
export function checkProofs(leanDir: string, module: string, claims: Claim[]): ProofCheck {
  const proofFile = join(leanDir, ...module.split('.'), 'Proofs.lean');
  const problems = checkProofFile(readFileSync(proofFile, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'simulant-proofs-'));
  const file = join(dir, 'Check.lean');
  writeFileSync(file, [
    `import ${module}.Proofs`,
    // The theorem must have the generated statement's type (up to definitional unfolding of nothing else).
    ...claims.filter(c => c.statement).map(c => `example : ${module}.${c.statement} := ${module}.${c.theorem}`),
    ...claims.map(c => `#print axioms ${module}.${c.theorem}`),
  ].join('\n') + '\n');
  const axioms: Record<string, string[]> = {};
  try {
    const out = execFileSync('lake', ['env', 'lean', file], { cwd: leanDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    for (const c of claims) {
      const name = `${module}.${c.theorem}`;
      const deps = out.match(new RegExp(`'${name.replace(/\./g, '\\.')}' depends on axioms: \\[([^\\]]*)\\]`));
      axioms[c.theorem] = deps ? deps[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      for (const a of axioms[c.theorem]) {
        if (!ALLOWED_AXIOMS.has(a)) problems.push(`${c.theorem} depends on axiom ${a}`);
      }
    }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    problems.push(`Lean rejected the check:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { ok: problems.length === 0, problems, axioms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [module, ...specs] = process.argv.slice(2);
  const claims = specs.map(s => { const [theorem, statement] = s.split(':'); return statement ? { theorem, statement } : { theorem }; });
  const result = checkProofs(new URL('../../../lean/', import.meta.url).pathname, module, claims);
  console.log(JSON.stringify(result, null, 1));
  process.exit(result.ok ? 0 : 1);
}
