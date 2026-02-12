// query-dto.hbs - Fixed version with proper class structure
const { mapType } = require('../utils/type-mapper');

module.exports = ({
  Entity,
  queryFields,
  classComment,
  enumImports,
  entity,
  embeddedSchemas = [],
}) => {
  const swaggerImports = new Set(['ApiPropertyOptional']);
  const validatorImports = new Set(['IsOptional']);
  const transformerImports = new Set();
  const customImports = new Map();
  const fieldEnumImports = new Set();
  let body = '';

  // Generate dynamic class documentation
  const generateClassDoc = () => {
    const entityName = entity || Entity.toLowerCase();

    if (classComment) {
      return `/**
 * ${Entity} Query DTO
 * ${'='.repeat(Entity.length + 10)}
 * ${classComment}
 * 
 * Used for: Filtering and searching ${entityName} records
 * Extends PaginationDto for pagination support
 */
`;
    }
    return `/**
 * ${Entity} Query DTO
 * ===================
 * Data Transfer Object for querying ${Entity} records
 * 
 * Extends PaginationDto for pagination support
 */
`;
  };

  // Get query fields - if none provided, use empty array
  let fieldsToUse =
    queryFields && queryFields.length > 0
      ? queryFields.filter(
          (f) => !f.isEmbeddedSchemaField && f.name !== 'searchText',
        ) // Exclude embedded schema fields and potential duplicate searchText
      : [];

  // Always include searchText field for generic searching
  fieldsToUse.unshift({
    name: 'searchText',
    tsType: 'string',
    isOptional: true,
    comment: 'Search by name, code, or identifier',
    source: 'query',
    validation: {},
  });

  // Add class declaration
  body += `export class ${Entity}QueryDto extends PaginationDto {\n`;

  // Process each field
  for (const field of fieldsToUse) {
    // Skip auto-generated and system fields for query DTO
    if (
      field.source === 'system' ||
      field.source === 'auto' ||
      field.source === 'audit'
    ) {
      continue;
    }

    // All fields are optional in Query DTO
    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: false,
      isOptional: true,
    });

    // ============================================
    // Handle Custom Imports
    // ============================================

    // Store enum import if exists
    if (mapped.enumInfo?.importStatement) {
      fieldEnumImports.add(mapped.enumInfo.importStatement);
    } else if (field.enumType) {
      const enumPath = `src/shared/enums/${entity}.enums`;
      const importStatement = `import { ${field.enumType} } from '${enumPath}';`;
      fieldEnumImports.add(importStatement);
    } else if (field.enumImport?.statement) {
      fieldEnumImports.add(field.enumImport.statement);
    }

    // Handle validator and transformer imports
    if (mapped.extraImports) {
      const extraImports = Array.isArray(mapped.extraImports)
        ? mapped.extraImports
        : mapped.extraImports.split(', ').filter(Boolean);

      extraImports.forEach((imp) => {
        const trimmedImp = imp.trim();
        if (!trimmedImp) return;

        const validatorDecorators = [
          'IsNotEmpty',
          'IsOptional',
          'IsString',
          'IsNumber',
          'IsBoolean',
          'IsDate',
          'IsArray',
          'IsEnum',
          'IsMongoId',
          'Min',
          'Max',
          'MinLength',
          'MaxLength',
          'Matches',
          'ValidateNested',
        ];

        const transformerDecorators = ['Type'];

        if (validatorDecorators.includes(trimmedImp)) {
          if (trimmedImp !== 'IsOptional') {
            validatorImports.add(trimmedImp);
          }
        } else if (transformerDecorators.includes(trimmedImp)) {
          transformerImports.add(trimmedImp);
        } else if (/^[A-Z]/.test(trimmedImp) && !trimmedImp.includes('.')) {
          if (
            trimmedImp.includes('Status') ||
            trimmedImp.includes('Enum') ||
            trimmedImp.includes('Type')
          ) {
            const enumPath = `src/shared/enums/${entity}.enums`;
            if (!customImports.has(enumPath)) {
              customImports.set(enumPath, new Set());
            }
            customImports.get(enumPath).add(trimmedImp);
          }
        }
      });
    }

    // ============================================
    // Clean up validator decorators
    // ============================================
    let validatorDecorators = mapped.validator
      .split('\n')
      .map((v) => v.trim())
      .filter(
        (v) =>
          v &&
          !v.includes('@IsNotEmpty') &&
          !v.includes('@Min(null') &&
          !v.includes('@Max(null'),
      );

    // Remove any duplicate IsOptional
    validatorDecorators = [...new Set(validatorDecorators)];

    // Add IsOptional if not already present
    if (!validatorDecorators.some((v) => v.includes('@IsOptional'))) {
      validatorDecorators.unshift('@IsOptional()');
    }

    // ============================================
    // Enhance Swagger Decorator
    // ============================================
    let swaggerDecorator = mapped.swagger;

    // Fix any malformed Swagger decorators
    swaggerDecorator = swaggerDecorator
      .replace('{,', '{')
      .replace(', }', '}')
      .replace('({,', '({')
      .replace(/,(\s*[}])/g, '$1')
      .replace('@ApiProperty(', '@ApiPropertyOptional(')
      .replace('@ApiPropertyOptionalOptional(', '@ApiPropertyOptional(');

    // Ensure it's ApiPropertyOptional for query DTO
    if (!swaggerDecorator.includes('@ApiPropertyOptional')) {
      swaggerDecorator = swaggerDecorator.replace(
        '@ApiProperty',
        '@ApiPropertyOptional',
      );
    }

    // Handle enum fields
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType);
      swaggerDecorator = `@ApiPropertyOptional({ enum: ${field.enumType}, example: ${field.enumType}.${exampleValue} })`;
    }

    // Special handling for searchText
    if (field.name === 'searchText') {
      swaggerDecorator =
        '@ApiPropertyOptional({ description: "Search by name, code, or identifier", example: "search term" })';
    }

    // Special handling for status field
    if (field.name === 'status') {
      swaggerDecorator =
        '@ApiPropertyOptional({ description: "Filter by status" })';
    }

    // ============================================
    // Add field documentation INSIDE the class
    // ============================================
    if (field.comment) {
      const fieldTitle =
        field.name.charAt(0).toUpperCase() + field.name.slice(1);
      const separator = '-'.repeat(fieldTitle.length);

      body += `  /**
   * ${fieldTitle}
   * ${separator}
   * ${field.comment}
   */\n`;
    }

    // Determine TypeScript type
    let dtoType = mapped.dtoType || field.tsType;

    // Add field decorators and declaration
    body += `  ${swaggerDecorator}\n`;

    // Add validators
    validatorDecorators.forEach((v) => {
      if (v.trim()) {
        body += `  ${v}\n`;
      }
    });

    body += `  ${field.name}?: ${dtoType};\n\n`;
  }

  // Close the class
  body += `}`;

  // ============================================
  // Generate Import Section
  // ============================================
  let importSection = '';

  // Add enum imports
  const uniqueEnumImports = new Set();
  fieldEnumImports.forEach((imp) => {
    if (imp && imp.trim()) {
      uniqueEnumImports.add(imp.trim());
    }
  });

  // Add custom imports (enums)
  for (const [importPath, imports] of customImports) {
    if (imports.size > 0) {
      const sortedImports = Array.from(imports).sort();
      importSection += `import { ${sortedImports.join(', ')} } from '${importPath}';\n`;
    }
  }

  // Add enum imports from parameters
  if (enumImports && enumImports.length > 0) {
    enumImports.forEach((imp) => {
      if (imp && !importSection.includes(imp)) {
        importSection += imp + '\n';
      }
    });
  }

  // Add unique enum imports
  uniqueEnumImports.forEach((imp) => {
    if (!importSection.includes(imp)) {
      importSection += imp + '\n';
    }
  });

  if (importSection) {
    importSection += '\n';
  }

  // ============================================
  // Generate Imports
  // ============================================
  const sortedValidatorImports = Array.from(validatorImports)
    .filter(Boolean)
    .sort();

  const sortedTransformerImports = Array.from(transformerImports)
    .filter(Boolean)
    .sort();

  const sortedSwaggerImports = Array.from(swaggerImports)
    .filter(Boolean)
    .sort();

  // ============================================
  // Build the complete file
  // ============================================
  let fileContent = importSection;

  // Add Swagger imports
  fileContent += `import { ${sortedSwaggerImports.join(', ')} } from '@nestjs/swagger';\n`;

  // Add class-validator imports
  if (sortedValidatorImports.length > 0) {
    fileContent += `import { ${sortedValidatorImports.join(', ')} } from 'class-validator';\n`;
  }

  // Add class-transformer imports
  if (sortedTransformerImports.length > 0) {
    fileContent += `import { ${sortedTransformerImports.join(', ')} } from 'class-transformer';\n`;
  }

  // Add PaginationDto import
  fileContent += `import { PaginationDto } from 'src/shared/dto/pagination.dto';\n\n`;

  // Add the class documentation and class
  fileContent += body;

  return fileContent;
};

/**
 * Dynamic enum example generator
 */
function getEnumExample(enumType) {
  const patterns = [
    { pattern: /Status$/, example: 'ACTIVE' },
    { pattern: /Type$/, example: 'DEFAULT' },
    { pattern: /Role$/, example: 'USER' },
    { pattern: /Gender$/, example: 'MALE' },
    { pattern: /Priority$/, example: 'MEDIUM' },
    { pattern: /State$/, example: 'ACTIVE' },
    { pattern: /Mode$/, example: 'EDIT' },
    { pattern: /Level$/, example: 'BASIC' },
    { pattern: /Category$/, example: 'GENERAL' },
  ];

  for (const { pattern, example } of patterns) {
    if (pattern.test(enumType)) {
      return example;
    }
  }

  const commonExamples = {
    RouteStatus: 'ACTIVE',
    OrderStatus: 'PENDING',
    PaymentStatus: 'PENDING',
    ShipmentStatus: 'DRAFT',
    ApprovalStatus: 'PENDING',
    DayOfWeek: 'MONDAY',
    Month: 'JANUARY',
    Quarter: 'Q1',
  };

  return commonExamples[enumType] || 'ACTIVE';
}
