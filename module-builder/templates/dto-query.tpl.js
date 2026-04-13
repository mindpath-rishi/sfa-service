const { mapType } = require('../utils/type-mapper');

module.exports = ({ Entity, dtoFields, classComment }) => {
  const queryFields = dtoFields?.query || [];

  const swaggerImports = new Set(['ApiPropertyOptional']);
  const validatorImports = new Set(['IsOptional']);
  const transformerImports = new Set();
  const enumImportsMap = new Map();

  let body = '';

  /* ======================================================
   * CLASS DOC
   * ====================================================== */
  const generateClassDoc = () => `/**
 * ${Entity}QueryDto
 * =================
 * ${classComment || `DTO for querying ${Entity}`}
 */
`;

  /* ======================================================
   * SEARCH FIELD (ALWAYS)
   * ====================================================== */
  const searchField = {
    name: 'searchText',
    tsType: 'string',
    isOptional: true,
  };

  let fieldsToUse = queryFields.length ? queryFields : [];

  if (!fieldsToUse.some((f) => f.name === 'searchText')) {
    fieldsToUse = [searchField, ...fieldsToUse];
  }

  body += generateClassDoc();
  body += `export class ${Entity}QueryDto extends PaginationDto {\n`;

  for (const field of fieldsToUse) {
    if (!field) continue;

    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: false,
      isOptional: true,
      isQueryDto: true,
    });

    /* ======================================================
     * VALIDATORS (SAFE)
     * ====================================================== */
    let validators = (mapped.validator || '')
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);

    validators = validators.filter(
      (v) => !v.includes('@IsNotEmpty') && !v.includes('@Min(null') && !v.includes('@Max(null'),
    );

    // ensure single IsOptional
    validators = validators.filter((v) => !v.includes('@IsOptional'));
    validators.unshift('@IsOptional()');

    /* ======================================================
     * ENUM IMPORTS
     * ====================================================== */
    if (field.enumType) {
      const enumPath = field.enumPath || field.enumImport?.path;

      if (enumPath) {
        if (!enumImportsMap.has(enumPath)) {
          enumImportsMap.set(enumPath, new Set());
        }
        enumImportsMap.get(enumPath).add(field.enumType);
      }
    }

    /* ======================================================
     * SWAGGER
     * ====================================================== */
    let swagger = mapped.swagger || `@ApiPropertyOptional()`;

    /* ======================================================
     * SEARCH FIELD SPECIAL CASE
     * ====================================================== */
    if (field.name === 'searchText') {
      swagger = `@ApiPropertyOptional({ description: 'Search text', example: 'abc' })`;

      validators = ['@IsOptional()', '@IsString()', '@MinLength(2)', '@MaxLength(100)'];

      validatorImports.add('IsString');
      validatorImports.add('MinLength');
      validatorImports.add('MaxLength');
    }

    /* ======================================================
     * IMPORT HANDLING
     * ====================================================== */
    if (mapped.extraImports?.length) {
      mapped.extraImports.forEach((imp) => {
        if (!imp) return;

        // 🚨 IMPORTANT: skip enum from validator imports
        if (field.enumType && imp === field.enumType) return;

        if (imp === 'Type') transformerImports.add('Type');
        else validatorImports.add(imp);
      });
    }

    /* ======================================================
     * OUTPUT FIELD
     * ====================================================== */
    body += `  ${swagger}\n`;

    [...new Set(validators)].forEach((v) => {
      body += `  ${v}\n`;
    });

    let dtoType = field.enumType || mapped.dtoType || field.tsType;

    if (field.isArray && !dtoType.endsWith('[]')) {
      dtoType += '[]';
    }

    body += `  ${field.name}?: ${dtoType};\n\n`;
  }

  body += `}`;

  /* ======================================================
   * IMPORTS
   * ====================================================== */
  let imports = '';

  // ENUM IMPORTS
  for (const [path, set] of enumImportsMap) {
    imports += `import { ${[...set].join(', ')} } from '${path}';\n`;
  }

  if (imports) imports += '\n';

  // SWAGGER
  if (swaggerImports.size) {
    imports += `import { ${[...swaggerImports].join(', ')} } from '@nestjs/swagger';\n`;
  }

  // VALIDATORS
  if (validatorImports.size) {
    imports += `import { ${[...validatorImports].join(', ')} } from 'class-validator';\n`;
  }

  // TRANSFORMER
  if (transformerImports.size) {
    imports += `import { ${[...transformerImports].join(', ')} } from 'class-transformer';\n`;
  }

  // COMMON
  imports += `import { PaginationDto } from 'src/shared/dto/pagination.dto';\n\n`;

  return `${imports}${body}`;
};
