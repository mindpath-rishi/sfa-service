// update-dto.hbs - Updated with create-dto improvements
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
  const enumImportsMap = new Map(); // Track enum imports by path to avoid duplicates
  const nestedDtoClasses = [];
  let body = '';

  // ============================================
  // Dynamic enum example generator - NO HARDCODED VALUES
  // ============================================
  const getEnumExample = (enumType, fieldInfo = {}) => {
    // If we have actual enum values from the parsed schema, use the first one
    if (fieldInfo.enumValues && fieldInfo.enumValues.length > 0) {
      const firstValue = fieldInfo.enumValues[0];
      return firstValue.key || firstValue;
    }
    
    // If we have enum map, get the first key
    if (fieldInfo.enumMap && Object.keys(fieldInfo.enumMap).length > 0) {
      return Object.keys(fieldInfo.enumMap)[0];
    }
    
    // If we have enum import with values, get the first key
    if (fieldInfo.enumImport && fieldInfo.enumImport.values && fieldInfo.enumImport.values.length > 0) {
      return fieldInfo.enumImport.values[0].key || fieldInfo.enumImport.values[0];
    }
    
    // Try to get from defaultValue if available
    if (fieldInfo.defaultValue) {
      const defaultMatch = fieldInfo.defaultValue.match(/\.(\w+)$/);
      if (defaultMatch) {
        return defaultMatch[1];
      }
    }
    
    return null;
  };

  // ============================================
  // Format default value for Swagger
  // ============================================
  const formatDefaultValue = (field) => {
    if (!field.defaultValue) return null;
    
    if (field.enumType) {
      const match = field.defaultValue.match(/\.(\w+)$/);
      if (match) {
        return `${field.enumType}.${match[1]}`;
      }
    }
    return field.defaultValue;
  };

  // Generate dynamic class documentation
  const generateClassDoc = () => {
    const entityName = entity || Entity.toLowerCase();

    if (classComment) {
      return `/**
 * Update${Entity}Dto
 * =================
 * ${classComment}
 * 
 * Used for: Partial updates of ${entityName} records
 * All fields are optional - only provided fields will be updated
 * Supports partial updates - omitted fields will retain their existing values
 */
`;
    }
    return `/**
 * Update${Entity}Dto
 * =================
 * Data Transfer Object for updating ${Entity} records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
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

      // Handle enum imports for nested DTO
      if (field.enumType) {
        let enumPath = 'src/shared/enums';
        if (field.enumImport?.path) {
          enumPath = field.enumImport.path;
        } else if (entity) {
          enumPath = `src/shared/enums/${entity}.enums`;
        }
        enumPath = enumPath.replace(/\.ts$/, '');
        
        if (!enumImportsMap.has(enumPath)) {
          enumImportsMap.set(enumPath, new Set());
        }
        enumImportsMap.get(enumPath).add(field.enumType);
      }

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

      // Handle enum fields in nested DTO
      if (field.enumType) {
        const exampleValue = getEnumExample(field.enumType, field);
        const defaultValue = formatDefaultValue(field);
        
        const options = [];
        options.push(`enum: ${field.enumType}`);
        
        if (exampleValue) {
          options.push(`example: ${field.enumType}.${exampleValue}`);
        }
        
        if (defaultValue) {
          options.push(`default: ${defaultValue}`);
        }
        
        if (field.comment) {
          options.push(`description: '${field.comment}'`);
        }
        
        const optionsString = options.join(', ');
        swaggerDecorator = `@ApiPropertyOptional({ ${optionsString} })`;
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

      // Add IsEnum for enum fields
      if (field.enumType && !validators.some(v => v.includes('@IsEnum'))) {
        validators.push(`@IsEnum(${field.enumType})`);
      }

      // Add validator imports
      if (mapped.extraImports) {
        const extraImports = Array.isArray(mapped.extraImports)
          ? mapped.extraImports
          : mapped.extraImports.split(', ').filter(Boolean);

        extraImports.forEach((imp) => {
          const trimmedImp = imp.trim();
          if (trimmedImp && !trimmedImp.includes('IsNotEmpty')) {
            if (!['IsOptional', 'IsNotEmpty'].includes(trimmedImp)) {
              validatorImports.add(trimmedImp);
            }
          }
        });
      }

      nestedClassBody += `  ${swaggerDecorator}\n`;
      
      // Deduplicate validators
      const uniqueValidators = [];
      const validatorSet = new Set();
      validators.forEach(v => {
        const normalized = v.replace(/\s+/g, ' ').trim();
        if (!validatorSet.has(normalized)) {
          validatorSet.add(normalized);
          uniqueValidators.push(v);
        }
      });

      uniqueValidators.forEach((v) => {
        if (v.trim()) {
          nestedClassBody += `  ${v}\n`;
        }
      });
      
      // Determine TypeScript type
      let tsType = field.tsType;
      if (field.enumType) {
        tsType = field.enumType;
      }
      
      nestedClassBody += `  ${field.name}?: ${tsType};\n\n`;
    });

    nestedClassBody += `}\n`;
    return { className, body: nestedClassBody };
  };

  body += generateClassDoc();

  // ============================================
  // First Pass: Generate ALL Nested DTO Classes
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
    // For update DTO, we want to include:
    // - All user fields (even those with defaults)
    // - Embedded schema fields
    // - Status fields (even with defaults)
    
    // Skip only auto-generated system fields
    if (field.source === 'system' || field.source === 'auto' || field.source === 'audit') {
      // But keep status field if it's user field
      if (field.name === 'status' && field.source === 'user') {
        // Include it
      } else {
        continue;
      }
    }

    // All fields are optional in Update DTO
    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: false,
      isOptional: true,
      isUpdateDto: true,
    });

    // ============================================
    // Handle Enum Imports (deduplicated)
    // ============================================
    if (field.enumType) {
      let enumPath = 'src/shared/enums';
      if (field.enumImport?.path) {
        enumPath = field.enumImport.path;
      } else if (entity) {
        enumPath = `src/shared/enums/${entity}.enums`;
      } else {
        enumPath = `src/shared/enums/${Entity.toLowerCase()}.enums`;
      }
      enumPath = enumPath.replace(/\.ts$/, '');
      
      if (!enumImportsMap.has(enumPath)) {
        enumImportsMap.set(enumPath, new Set());
      }
      enumImportsMap.get(enumPath).add(field.enumType);
    }

    // ============================================
    // Handle Validator and Transformer Imports
    // ============================================
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

    // Add IsOptional for all fields (update DTO = all optional)
    validatorDecorators = validatorDecorators.filter(v => !v.includes('@IsOptional'));
    validatorDecorators.unshift('@IsOptional()');

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

    // Handle enum fields with dynamic examples and defaults
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType, field);
      const defaultValue = formatDefaultValue(field);
      
      const options = [];
      options.push(`enum: ${field.enumType}`);
      
      if (exampleValue) {
        options.push(`example: ${field.enumType}.${exampleValue}`);
      }
      
      if (defaultValue) {
        options.push(`default: ${field.enumType}.${defaultValue}`);
      }
      
      if (field.comment) {
        options.push(`description: '${field.comment}'`);
      }
      
      const optionsString = options.join(', ');
      swaggerDecorator = `@ApiPropertyOptional({ ${optionsString} })`;

      // Add IsEnum validator if not present
      if (!validatorDecorators.some((v) => v.includes('@IsEnum'))) {
        validatorDecorators.push(`@IsEnum(${field.enumType})`);
      }
    }

    // Handle reference fields (string IDs)
    if (field.isReferenceField && field.refType) {
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
      if (!validatorDecorators.some((v) => v.includes('@IsString'))) {
        if (field.isArray) {
          validatorDecorators = validatorDecorators.filter(
            (v) => !v.includes('@IsArray'),
          );
          validatorDecorators.push('@IsArray()');
          validatorDecorators.push('@IsString({ each: true })');
        } else {
          validatorDecorators.push('@IsString()');
        }
      }
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

      // Add ValidateNested and Type validators
      if (!validatorDecorators.some((v) => v.includes('@ValidateNested'))) {
        if (field.isArray) {
          validatorDecorators.push('@ValidateNested({ each: true })');
        } else {
          validatorDecorators.push('@ValidateNested()');
        }
      }

      // Replace Type decorator
      validatorDecorators = validatorDecorators.filter(
        (v) => !v.includes('@Type('),
      );

      if (field.isArray) {
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      } else {
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      }
    }

    // Handle fields with default values
    if (field.hasDefaultValue && field.defaultValue && !field.enumType) {
      // Add default to swagger decorator if not already present
      if (!swaggerDecorator.includes('default:')) {
        swaggerDecorator = swaggerDecorator.replace(
          '})',
          `, default: ${field.defaultValue} })`
        );
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

    // For enum fields, use the enum type
    if (field.enumType) {
      dtoType = field.enumType;
    }

    // For embedded schemas, use the nested DTO class
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      dtoType = `Update${field.embeddedSchema.name}Dto`;
      if (field.isArray) {
        dtoType += '[]';
      }
    }

    body += `  ${swaggerDecorator}\n`;

    // Deduplicate validators
    const uniqueValidators = [];
    const validatorSet = new Set();
    validatorDecorators.forEach(v => {
      const normalized = v.replace(/\s+/g, ' ').trim();
      if (!validatorSet.has(normalized)) {
        validatorSet.add(normalized);
        uniqueValidators.push(v);
      }
    });

    uniqueValidators.forEach((v) => {
      if (v.trim()) {
        body += `  ${v}\n`;
      }
    });

    body += `  ${field.name}?: ${dtoType};\n\n`;
  }

  // ============================================
  // Generate Import Section (deduplicated)
  // ============================================
  let importSection = '';

  // Add enum imports (deduplicated by path)
  for (const [importPath, enumSet] of enumImportsMap) {
    if (enumSet.size > 0) {
      const sortedEnums = Array.from(enumSet).sort();
      importSection += `import { ${sortedEnums.join(', ')} } from '${importPath}';\n`;
    }
  }

  // Add any additional enum imports from parameters (deduplicated)
  if (enumImports && enumImports.length > 0) {
    enumImports.forEach(imp => {
      if (imp && imp.trim()) {
        const match = imp.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"]/);
        if (match) {
          const [, enums, path] = match;
          const enumList = enums.split(',').map(e => e.trim());
          
          if (!enumImportsMap.has(path)) {
            enumImportsMap.set(path, new Set());
          }
          
          enumList.forEach(e => {
            if (e) enumImportsMap.get(path).add(e);
          });
        }
      }
    });
  }

  // Regenerate enum imports after processing parameters
  importSection = '';
  for (const [importPath, enumSet] of enumImportsMap) {
    if (enumSet.size > 0) {
      const sortedEnums = Array.from(enumSet).sort();
      importSection += `import { ${sortedEnums.join(', ')} } from '${importPath}';\n`;
    }
  }

  if (importSection) {
    importSection += '\n';
  }

  // ============================================
  // Generate Decorator Imports
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
  if (sortedSwaggerImports.length > 0) {
    fileContent += `import { ${sortedSwaggerImports.join(', ')} } from '@nestjs/swagger';\n`;
  }

  // Add class-validator imports
  if (sortedValidatorImports.length > 0) {
    fileContent += `import { ${sortedValidatorImports.join(', ')} } from 'class-validator';\n`;
  }

  // Add class-transformer imports
  if (sortedTransformerImports.length > 0) {
    fileContent += `import { ${sortedTransformerImports.join(', ')} } from 'class-transformer';\n`;
  }

  // Add blank line if we have any imports
  if (fileContent) {
    fileContent += '\n';
  }

  // Add nested DTO classes (before main DTO)
  nestedDtoClasses.forEach((nestedDto) => {
    fileContent += nestedDto.body;
  });

  // Add main DTO class
  fileContent += `\nexport class Update${Entity}Dto {\n${body}}\n`;

  return fileContent;
};