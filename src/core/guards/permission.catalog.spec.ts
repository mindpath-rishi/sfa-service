/**
 * Keeps role-permissions.constants.ts in step with the controllers, so a new
 * @Permissions key can't ship without being granted to anyone.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { PERMISSIONS } from 'src/shared/constants/permissions.constants';
import {
  ALL_PERMISSIONS,
  FIELD_PERMISSIONS,
} from 'src/shared/constants/role-permissions.constants';

const SRC = join(__dirname, '..', '..');

const controllers = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllers(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });

const keysIn = (text: string) =>
  [...text.matchAll(/@Permissions\(([^)]*)\)/g)].flatMap(([, args]) => [
    ...[...args.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1]),
    ...[...args.matchAll(/PERMISSIONS\.([A-Z_]+)/g)].map(
      (m) => PERMISSIONS[m[1] as keyof typeof PERMISSIONS] ?? m[1],
    ),
  ]);

/** Decorator lines above (and directly below) each route decorator. */
const routeBlocks = (source: string) => {
  const lines = source.split('\n');
  const blocks: string[] = [];
  lines.forEach((line, i) => {
    if (!/^\s+@(Get|Post|Put|Patch|Delete)\(/.test(line)) return;
    let start = i;
    while (
      start > 0 &&
      /^\s+@|^\s+[)}\]'"`\w].*[,)]?$/.test(lines[start - 1]) &&
      !/^\s+(async\s+)?\w+\s*\(.*\)\s*(:.*)?\{$/.test(lines[start - 1]) &&
      lines[start - 1].trim() !== '}'
    ) {
      start -= 1;
    }
    let end = i;
    while (end < lines.length && !/^\s+(async\s+)?\w+\s*\(/.test(lines[end])) {
      end += 1;
    }
    blocks.push(lines.slice(start, end).join('\n'));
  });
  return blocks;
};

const files = controllers(SRC).map((path) => ({
  path,
  source: readFileSync(path, 'utf8'),
}));

describe('permission catalog', () => {
  it('lists every @Permissions key used by a controller', () => {
    const all = new Set(ALL_PERMISSIONS);
    const missing = files.flatMap(({ path, source }) =>
      keysIn(source)
        .filter((k) => !all.has(k))
        .map((k) => `${k} (${path.replace(SRC, 'src')})`),
    );
    expect(missing).toEqual([]);
  });

  it('field roles get the keys of every route they can call', () => {
    const field = new Set<string>(FIELD_PERMISSIONS);
    const missing = files.flatMap(({ path, source }) => {
      const classLevelBackOffice =
        /@BackOfficeOnly\(\)[\s\S]{0,300}?export class/.test(source);
      if (classLevelBackOffice) return [];
      return routeBlocks(source)
        .filter(
          (b) => !/@BackOfficeOnly\(\)|SuperAdminGuard|@Public\(\)/.test(b),
        )
        .flatMap((b) => keysIn(b))
        .filter((k) => !field.has(k))
        .map((k) => `${k} (${path.replace(SRC, 'src')})`);
    });
    expect(missing).toEqual([]);
  });
});
