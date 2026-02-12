// update-dto.hbs - Fixed version with proper embedded schema field inclusion
const { mapType } = require('../utils/type-mapper');

module.exports = ({
  Entity,
  dtoFields,
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
  const nestedDtoClasses = [];
  let body = '';

  // Generate dynamic class documentation
  const generateClassDoc = () => {
    const entityName = entity || Entity.toLowerCase();

    if (classComment) {
      return `/**
 * ${Entity} Update DTO
 * ${'='.repeat(Entity.length + 12)}
 * ${classComment}
 * 
 * Used for: Partial updates of ${entityName} records
 * All fields are optional - only provided fields will be updated
 */
`;
    }
    return `/**
 * ${Entity} Update DTO
 * ====================
 * Data Transfer Object for updating ${Entity} records
 * 
 * All fields are optional for partial updates
 */
`;
  };

  // ============================================
  // Generate Nested DTO Class for Embedded Schemas
  // ============================================
  const generateNestedDtoClass = (schema) => {
    const className = `Update${schema.name}Dto`;
    let nestedClassBody = '';

    nestedClassBody += `\nexport class ${className} {\n`;

    schema.fields.forEach((field) => {
      // Skip system fields
      if (
        field.name === '_id' ||
        field.name === '__v' ||
        field.name === 'createdAt' ||
        field.name === 'updatedAt' ||
        field.name === 'deletedAt'
      ) {
        return;
      }

      const mapped = mapType(field.tsType, {
        ...field,
        isRequired: false,
        isOptional: true,
        isUpdateDto: true,
      });

      // Add field documentation if exists
      if (field.comment) {
        nestedClassBody += `  /**\n   * ${field.comment}\n   */\n`;
      }

      // Clean up swagger decorator
      let swaggerDecorator = mapped.swagger
        .replace('{,', '{')
        .replace(', }', '}')
        .replace('({,', '({')
        .replace(/,(\s*[}])/g, '$1')
        .replace('@ApiProperty(', '@ApiPropertyOptional(')
        .replace('@ApiPropertyOptionalOptional(', '@ApiPropertyOptional(')
        .replace(/@Min\(null\)/g, '')
        .replace(/@Max\(null\)/g, '');

      // Ensure it's ApiPropertyOptional
      if (!swaggerDecorator.includes('@ApiPropertyOptional')) {
        swaggerDecorator = swaggerDecorator.replace(
          '@ApiProperty',
          '@ApiPropertyOptional',
        );
      }

      // Clean up validators
      let validators = mapped.validator
        .split('\n')
        .map((v) => v.trim())
        .filter(
          (v) =>
            v &&
            !v.includes('@IsNotEmpty') &&
            !v.includes('@Min(null') &&
            !v.includes('@Max(null'),
        );

      // Remove any IsNotEmpty validators
      validators = validators.filter((v) => !v.includes('@IsNotEmpty'));

      // Add IsOptional if not already present
      if (!validators.some((v) => v.includes('@IsOptional'))) {
        validators.unshift('@IsOptional()');
      }

      // Add validator imports
      if (mapped.extraImports) {
        const extraImports = Array.isArray(mapped.extraImports)
          ? mapped.extraImports
          : mapped.extraImports.split(', ').filter(Boolean);

        extraImports.forEach((imp) => {
          const trimmedImp = imp.trim();
          if (trimmedImp && !trimmedImp.includes('IsNotEmpty')) {
            validatorImports.add(trimmedImp);
          }
        });
      }

      nestedClassBody += `  ${swaggerDecorator}\n`;
      validators.forEach((v) => {
        if (v.trim()) {
          nestedClassBody += `  ${v}\n`;
        }
      });
      nestedClassBody += `  ${field.name}?: ${field.tsType};\n\n`;
    });

    nestedClassBody += `}\n`;
    return { className, body: nestedClassBody };
  };

  body += generateClassDoc();

  // ============================================
  // First Pass: Generate ALL Nested DTO Classes from embeddedSchemas
  // ============================================

  // Generate nested DTOs from all embedded schemas
  embeddedSchemas.forEach((schema) => {
    if (schema.fields && schema.fields.length > 0) {
      const className = `Update${schema.name}Dto`;
      const alreadyGenerated = nestedDtoClasses.some(
        (dto) => dto.className === className,
      );

      if (!alreadyGenerated) {
        const nestedDto = generateNestedDtoClass(schema);
        nestedDtoClasses.push(nestedDto);
      }
    }
  });

  // ============================================
  // Second Pass: Generate Main DTO Fields
  // ============================================
  const updateFields = dtoFields?.update || [];

  // Also check for embedded schema fields that might be in the main fields
  const allEmbeddedSchemaFields = updateFields.filter(
    (f) => f.isEmbeddedSchemaField,
  );

  // Generate nested DTOs for any embedded schema fields not already generated
  allEmbeddedSchemaFields.forEach((field) => {
    if (field.embeddedSchema) {
      const className = `Update${field.embeddedSchema.name}Dto`;
      const alreadyGenerated = nestedDtoClasses.some(
        (dto) => dto.className === className,
      );

      if (!alreadyGenerated) {
        const nestedDto = generateNestedDtoClass(field.embeddedSchema);
        nestedDtoClasses.push(nestedDto);
      }
    }
  });

  for (const field of updateFields) {
    // Include embedded schema fields, skip only system/auto/audit non-embedded fields
    if (
      field.source === 'system' ||
      field.source === 'auto' ||
      field.source === 'audit'
    ) {
      // Don't skip embedded schema fields
      if (!field.isEmbeddedSchemaField) {
        continue;
      }
    }

    // All fields are optional in Update DTO
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
          'IsString',
          'IsNumber',
          'IsBoolean',
          'IsDate',
          'IsArray',
          'IsEnum',
          'Min',
          'Max',
          'MinLength',
          'MaxLength',
          'Matches',
          'ValidateNested',
          'IsMongoId',
        ];

        const transformerDecorators = ['Type'];

        if (validatorDecorators.includes(trimmedImp)) {
          if (trimmedImp !== 'IsOptional' && trimmedImp !== 'IsNotEmpty') {
            validatorImports.add(trimmedImp);
          }
        } else if (transformerDecorators.includes(trimmedImp)) {
          transformerImports.add(trimmedImp);
        } else if (/^[A-Z]/.test(trimmedImp) && !trimmedImp.includes('.')) {
          // Custom type import (enum, etc.)
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

    // Remove any IsNotEmpty validators
    validatorDecorators = validatorDecorators.filter(
      (v) => !v.includes('@IsNotEmpty'),
    );

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

    // Ensure it's ApiPropertyOptional for update DTO
    if (!swaggerDecorator.includes('@ApiPropertyOptional')) {
      swaggerDecorator = swaggerDecorator.replace(
        '@ApiProperty',
        '@ApiPropertyOptional',
      );
    }

    // Handle reference fields (string IDs)
    if (field.isReferenceField && field.refType) {
      // Format the reference name for display
      let refDisplayName = field.refType;
      if (refDisplayName.includes('_')) {
        refDisplayName = refDisplayName
          .split('_')
          .map(
            (word) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join('');
      }
      refDisplayName = refDisplayName
        .replace('master', '')
        .replace('Schema', '')
        .replace('Document', '');

      if (field.isArray) {
        swaggerDecorator = `@ApiPropertyOptional({ type: [String], description: 'Array of ${refDisplayName} IDs' })`;
      } else {
        swaggerDecorator = `@ApiPropertyOptional({ type: String, description: '${refDisplayName} ID' })`;
      }

      // Ensure we use IsString, not IsMongoId
      validatorDecorators = validatorDecorators.filter(
        (v) => !v.includes('@IsMongoId'),
      );

      // Add IsString validator
      const hasIsString = validatorDecorators.some((v) =>
        v.includes('@IsString'),
      );
      if (!hasIsString) {
        if (field.isArray) {
          // Find and remove IsArray if exists, we'll add it properly
          validatorDecorators = validatorDecorators.filter(
            (v) => !v.includes('@IsArray'),
          );
          validatorDecorators.push('@IsArray()');
          validatorDecorators.push('@IsString({ each: true })');
          validatorImports.add('IsArray');
          validatorImports.add('IsString');
        } else {
          validatorDecorators.push('@IsString()');
          validatorImports.add('IsString');
        }
      }
    }

    // Handle enum fields
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType);
      swaggerDecorator = `@ApiPropertyOptional({ enum: ${field.enumType}, example: ${field.enumType}.${exampleValue} })`;

      // Add IsEnum import
      validatorImports.add('IsEnum');
    }

    // Handle embedded schema fields
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      const nestedDtoName = `Update${field.embeddedSchema.name}Dto`;
      const description = `Update embedded ${field.embeddedSchema.name} ${field.isArray ? 'array' : 'object'}`;

      if (field.isArray) {
        swaggerDecorator = `@ApiPropertyOptional({ type: () => [${nestedDtoName}], description: '${description}' })`;
      } else {
        swaggerDecorator = `@ApiPropertyOptional({ type: () => ${nestedDtoName}, description: '${description}' })`;
      }

      // Add ValidateNested and Type validators for embedded schemas
      validatorImports.add('ValidateNested');
      transformerImports.add('Type');

      // Replace Type decorator to use the nested DTO class
      validatorDecorators = validatorDecorators.filter(
        (v) => !v.includes('@Type('),
      );

      if (field.isArray) {
        validatorDecorators.push('@ValidateNested({ each: true })');
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      } else {
        validatorDecorators.push('@ValidateNested()');
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      }
    }

    // ============================================
    // Add field documentation
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

    // For embedded schemas, use the nested DTO class
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      dtoType = `Update${field.embeddedSchema.name}Dto`;
      if (field.isArray) {
        dtoType += '[]';
      }
    }

    body += `  ${swaggerDecorator}\n`;

    // Add validators
    validatorDecorators.forEach((v) => {
      if (v.trim()) {
        body += `  ${v}\n`;
      }
    });

    body += `  ${field.name}?: ${dtoType};\n\n`;
  }

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
    .sort((a, b) => {
      if (a === 'ValidateNested') return 1;
      if (b === 'ValidateNested') return -1;
      if (a === 'Type') return 1;
      if (b === 'Type') return -1;
      return a.localeCompare(b);
    });

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

  // Add nested DTO classes (before main DTO)
  nestedDtoClasses.forEach((nestedDto) => {
    fileContent += nestedDto.body;
  });

  // Add main DTO class
  fileContent += `\nexport class Update${Entity}Dto {\n${body}}\n`;

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
    CustomerStatus: 'ACTIVE',
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
