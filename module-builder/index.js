#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseSchema } = require('./utils/schema-parser');
const { writeFileSafe } = require('./utils/file-writer');

const controllerTpl = require('./templates/controller.tpl');
const serviceTpl = require('./templates/service.tpl');
const moduleTpl = require('./templates/module.tpl');
const constantsTpl = require('./templates/constants.tpl');
const enumTpl = require('./templates/enum.tpl');
const createDtoTpl = require('./templates/dto-create.tpl');
const updateDtoTpl = require('./templates/dto-update.tpl');
const queryDtoTpl = require('./templates/dto-query.tpl');
const minimist = require('minimist');

const ROOT = process.cwd();
const args = minimist(process.argv.slice(2));

// Support BOTH styles:
// npm run module:generate name=channel
// npm run module:generate -- --name=channel
// npm run module:generate channel

const entity =
  process.env.npm_config_name || // npm run module:generate name=channel
  args.name || // --name=channel
  args._[0]; // positional: channel

if (!entity || entity === true) {
  console.error('❌ Usage examples:');
  console.error('   npm run module:generate channel');
  console.error('   npm run module:generate -- --name=channel');
  console.error('   npm run module:generate name=channel');
  process.exit(1);
}

console.log(`🚀 Generating module for entity: ${entity}`);

// Validate schema exists
const schemaPath = path.join(
  ROOT,
  'src/core/database/mongo/schema',
  `${entity}.schema.ts`,
);
if (!fs.existsSync(schemaPath)) {
  console.error(`Error: Schema file not found: ${schemaPath}`);
  process.exit(1);
}

// Prevent module overwrite
const moduleDir = path.join(ROOT, 'src/modules/v1', entity);
if (fs.existsSync(moduleDir)) {
  console.error(`Error: Module "${entity}" already exists at ${moduleDir}`);
  process.exit(1);
}

const meta = parseSchema(ROOT, entity);

// Create module structure
const dirsToCreate = [meta.moduleDir, meta.dtoDir];
dirsToCreate.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const toTitleCase = (value) =>
  value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

let titleCase = toTitleCase(entity);

// Generate core module files
writeFileSafe(`${meta.moduleDir}/${entity}.controller.ts`, controllerTpl({...meta, titleCase}));
writeFileSafe(`${meta.moduleDir}/${entity}.service.ts`, serviceTpl(meta));
writeFileSafe(`${meta.moduleDir}/${entity}.module.ts`, moduleTpl(meta));
writeFileSafe(`${meta.moduleDir}/${entity}.constants.ts`, constantsTpl(meta));

// Generate DTOs
writeFileSafe(`${meta.dtoDir}/create-${entity}.dto.ts`, createDtoTpl(meta));
writeFileSafe(`${meta.dtoDir}/update-${entity}.dto.ts`, updateDtoTpl(meta));
writeFileSafe(`${meta.dtoDir}/${entity}-query.dto.ts`, queryDtoTpl(meta));

// Generate enums only if not existing
if (!fs.existsSync(`${meta.enumDir}/${entity}.enums.ts`)) {
  writeFileSafe(`${meta.enumDir}/${entity}.enums.ts`, enumTpl(meta));
}

// Update .env with module flag
const envPath = path.join(ROOT, '.env.example');
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, 'utf8');
  const flag = `ENABLE_${meta.ENTITY}_MODULE=true`;
  if (!env.includes(flag)) {
    env += `\n${flag}\n`;
    fs.writeFileSync(envPath, env);
  }
} else {
  fs.writeFileSync(envPath, `ENABLE_${meta.ENTITY}_MODULE=true\n`);
}

// Update API constants
const apiConstPath = path.join(ROOT, 'src/shared/constants/api.constants.ts');
if (fs.existsSync(apiConstPath)) {
  let api = fs.readFileSync(apiConstPath, 'utf8');

  // Add to API_MODULE
  const apiModulePattern = /API_MODULE\s*=\s*{([\s\S]*?)}/;
  const moduleMatch = api.match(apiModulePattern);
  if (moduleMatch && !api.includes(`${meta.ENTITY}: '${entity}'`)) {
    api = api.replace(
      apiModulePattern,
      `API_MODULE = {${moduleMatch[1].trim()}\n  ${meta.ENTITY}: '${entity}',\n}`,
    );
  }

  // Add to enable keys
  const enableKeysPattern = /API_MODULE_ENABLE_KEYS\s*=\s*{([\s\S]*?)}/;
  const enableMatch = api.match(enableKeysPattern);
  if (enableMatch && !api.includes(`ENABLE_${meta.ENTITY}_MODULE`)) {
    api = api.replace(
      enableKeysPattern,
      `API_MODULE_ENABLE_KEYS = {${enableMatch[1].trim()}\n  ${meta.ENTITY}: 'ENABLE_${meta.ENTITY}_MODULE',\n}`,
    );
  }

  fs.writeFileSync(apiConstPath, api);
}

// Auto-import in app.module.ts (SAFE + DETERMINISTIC)
const appModulePath = path.join(ROOT, 'src/app.module.ts');

if (fs.existsSync(appModulePath)) {
  let app = fs.readFileSync(appModulePath, 'utf8');

  const moduleName = `${meta.Entity}Module`;
  const importStatement = `import { ${moduleName} } from './modules/v1/${entity}/${entity}.module';`;

  // ==================================================
  // 1. Insert import after LAST import statement
  // ==================================================
  if (!app.includes(importStatement)) {
    const importLines = [...app.matchAll(/^import .*;$/gm)];

    if (importLines.length) {
      const last = importLines[importLines.length - 1];
      const pos = last.index + last[0].length;

      app = app.slice(0, pos) + '\n' + importStatement + app.slice(pos);
    } else {
      app = importStatement + '\n' + app;
    }
  }

  // ==================================================
  // 2. Insert module into @Module imports (NO REGEX)
  // ==================================================
  const moduleIdx = app.indexOf('@Module');

  if (moduleIdx === -1) throw new Error('❌ @Module not found');

  const importsIdx = app.indexOf('imports:', moduleIdx);

  if (importsIdx === -1) throw new Error('❌ imports array not found');

  const arrayStart = app.indexOf('[', importsIdx);

  if (arrayStart === -1) throw new Error('❌ imports [ not found');

  let depth = 1;
  let i = arrayStart + 1;

  while (i < app.length && depth > 0) {
    if (app[i] === '[') depth++;
    if (app[i] === ']') depth--;
    i++;
  }

  if (depth !== 0) throw new Error('❌ imports array not closed');

  const arrayEnd = i - 1;
  const content = app.slice(arrayStart + 1, arrayEnd);

  if (!content.includes(moduleName)) {
    const updated = content.trimEnd() + `\n    ${moduleName},`;

    app = app.slice(0, arrayStart + 1) + updated + app.slice(arrayEnd);
  }

  fs.writeFileSync(appModulePath, app);
}

console.log(`✓ ${meta.Entity} module generated successfully`);
