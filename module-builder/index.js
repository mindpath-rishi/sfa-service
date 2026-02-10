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

const ROOT = process.cwd();
const entity = process.argv[2];

if (!entity) {
  console.error('Error: Entity name required');
  console.log('Usage: node tools/module-builder <entity>');
  process.exit(1);
}

// Validate schema exists
const schemaPath = path.join(ROOT, 'src/core/database/mongo/schema', `${entity}.schema.ts`);
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
dirsToCreate.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Generate core module files
writeFileSafe(`${meta.moduleDir}/${entity}.controller.ts`, controllerTpl(meta));
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
const envPath = path.join(ROOT, '.env');
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
    api = api.replace(apiModulePattern, `API_MODULE = {${moduleMatch[1].trim()}\n  ${meta.ENTITY}: '${entity}',\n}`);
  }
  
  // Add to enable keys
  const enableKeysPattern = /API_MODULE_ENABLE_KEYS\s*=\s*{([\s\S]*?)}/;
  const enableMatch = api.match(enableKeysPattern);
  if (enableMatch && !api.includes(`ENABLE_${meta.ENTITY}_MODULE`)) {
    api = api.replace(enableKeysPattern, `API_MODULE_ENABLE_KEYS = {${enableMatch[1].trim()}\n  ${meta.ENTITY}: 'ENABLE_${meta.ENTITY}_MODULE',\n}`);
  }
  
  fs.writeFileSync(apiConstPath, api);
}

// Auto-import in app.module.ts
const appModulePath = path.join(ROOT, 'src/app.module.ts');
if (fs.existsSync(appModulePath)) {
  let app = fs.readFileSync(appModulePath, 'utf8');
  
  if (!app.includes(`${meta.Entity}Module`)) {
    // Add import statement
    const importStatement = `import { ${meta.Entity}Module } from './modules/v1/${entity}/${entity}.module';`;
    const importSection = app.match(/(import\s+.*?\s+from\s+['"].*?['"];\n)+/);
    
    if (importSection) {
      const lastImport = importSection[0].split('\n').filter(l => l.trim()).pop();
      const lastImportIndex = app.lastIndexOf(lastImport) + lastImport.length;
      app = app.slice(0, lastImportIndex) + '\n' + importStatement + app.slice(lastImportIndex);
    }
    
    // Add to imports array
    app = app.replace(/imports:\s*\[([\s\S]*?)\]/s, `imports: [$1\n    ${meta.Entity}Module,\n  ]`);
    
    fs.writeFileSync(appModulePath, app);
  }
}

console.log(`✓ ${meta.Entity} module generated successfully`);