// create-dto.hbs - Fixed version with proper nested DTO and enum support
const { mapType } = require('../utils/type-mapper');

module.exports = ({ Entity, dtoFields, classComment, enumImports, entity, embeddedSchemas = [] }) => {
  const swaggerImports = new Set(['ApiProperty', 'ApiPropertyOptional']);
  const validatorImports = new Set(['IsNotEmpty', 'IsOptional']);
  const transformerImports = new Set();
  const enumImportsMap = new Map(); // Track enum imports by path to avoid duplicates
  const nestedDtoClasses = [];
  let body = '';

  // Generate dynamic class documentation
  const generateClassDoc = () => {
    const entityName = entity || Entity.toLowerCase();
    
    if (classComment) {
      return `/**
 * Create${Entity}Dto
 * =================
 * ${classComment}
 * 
 * Used for creating new ${entityName} records
 */
`;
    }
    return `/**
 * Create${Entity}Dto
 * =================
 * Data Transfer Object for creating new ${Entity} records
 */
`;
  };

  // ============================================
  // Dynamic enum example generator - NO HARDCODED VALUES
  // ============================================
  const getEnumExample = (enumType, fieldInfo = {}) => {
    // If we have actual enum values from the parsed schema, use the first one
    if (fieldInfo.enumValues && fieldInfo.enumValues.length > 0) {
      const firstValue = fieldInfo.enumValues[0];
      // Return the key if it's an object with key/value, otherwise return the value
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
    
    // Last resort - return null (no example)
    return null;
  };

  // ============================================
  // Format default value for Swagger
  // ============================================
  const formatDefaultValue = (field) => {
    if (!field.defaultValue) return null;
    
    if (field.enumType) {
      // Extract the enum key from defaultValue (e.g., "InventoryTransactionStatus.POSTED" -> "POSTED")
      const match = field.defaultValue.match(/\.(\w+)$/);
      if (match) {
        return `${field.enumType}.${match[1]}`;
      }
    }
    return field.defaultValue;
  };

  body += generateClassDoc();

  // ============================================
  // Generate Nested DTO Class for Embedded Schemas
  // ============================================
  const generateNestedDtoClass = (schema) => {
    const className = `${schema.name}Dto`;
    let nestedClassBody = '';
    
    nestedClassBody += `\nexport class ${className} {\n`;

    schema.fields.forEach(field => {
      // Skip system fields
      if (field.name === '_id' || field.name === '__v' || field.name === 'createdAt' || field.name === 'updatedAt' || field.name === 'deletedAt') {
        return;
      }

      // Check if field has default value - if yes, it should be optional
      const hasDefaultValue = field.hasDefaultValue === true;
      const isRequired = field.propOptions?.required === true && !hasDefaultValue;
      
      const mapped = mapType(field.tsType, {
        ...field,
        isRequired: isRequired,
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
        .replace(/,(\s*[}])/g, '$1');

      // Handle enum fields in nested DTO
      if (field.enumType) {
        const exampleValue = getEnumExample(field.enumType, field);
        const defaultValue = formatDefaultValue(field);
        
        // Build swagger decorator with all options
        const options = [];
        options.push(`enum: ${field.enumType}`);
        if (exampleValue) {
          options.push(`example: ${field.enumType}.${exampleValue}`);
        }
        if (defaultValue) {
          options.push(`default: ${defaultValue}`);
        }
        
        const optionsString = options.join(', ');
        
        // Determine if should be ApiProperty or ApiPropertyOptional
        if (isRequired) {
          swaggerDecorator = `@ApiProperty({ ${optionsString} })`;
        } else {
          swaggerDecorator = `@ApiPropertyOptional({ ${optionsString} })`;
        }
        
        // Track enum import
        const enumPath = field.enumImport?.path || `src/shared/enums/${entity}.enums`;
        if (!enumImportsMap.has(enumPath)) {
          enumImportsMap.set(enumPath, new Set());
        }
        enumImportsMap.get(enumPath).add(field.enumType);
      }

      // Clean up validators
      let validators = mapped.validator
        .split('\n')
        .map(v => v.trim())
        .filter(v => v && !v.includes('@Min(null') && !v.includes('@Max(null'));

      // Remove IsOptional if field is required
      if (isRequired) {
        validators = validators.filter(v => !v.includes('@IsOptional'));
      } else {
        // Add IsOptional if not present and field is optional
        if (!validators.some(v => v.includes('@IsOptional'))) {
          validators.unshift('@IsOptional()');
        }
      }

      // Add IsEnum for enum fields if not present
      if (field.enumType && !validators.some(v => v.includes('@IsEnum'))) {
        validators.push(`@IsEnum(${field.enumType})`);
      }

      // Add validator imports
      if (mapped.extraImports) {
        const extraImports = Array.isArray(mapped.extraImports) 
          ? mapped.extraImports 
          : mapped.extraImports.split(', ').filter(Boolean);
        
        extraImports.forEach(imp => {
          const trimmedImp = imp.trim();
          if (trimmedImp) {
            // Check if it's a validator decorator
            const validatorDecorators = [
              'IsNotEmpty', 'IsOptional', 'IsString', 'IsNumber', 'IsBoolean', 
              'IsDate', 'IsArray', 'IsEnum', 'IsMongoId', 'Min', 'Max', 
              'MinLength', 'MaxLength', 'Matches', 'ValidateNested'
            ];
            
            if (validatorDecorators.includes(trimmedImp)) {
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

      uniqueValidators.forEach(v => {
        if (v.trim()) {
          nestedClassBody += `  ${v}\n`;
        }
      });
      
      // Determine TypeScript type
      let tsType = field.tsType;
      if (field.enumType) {
        tsType = field.enumType;
      }
      
      nestedClassBody += `  ${field.name}${isRequired ? '' : '?'}: ${tsType};\n\n`;
    });

    nestedClassBody += `}\n`;
    return { className, body: nestedClassBody };
  };

  // ============================================
  // First Pass: Generate Nested DTO Classes
  // ============================================
  const createFields = dtoFields?.create || [];
  
  // First, generate all nested DTO classes from embedded schemas
  embeddedSchemas.forEach(schema => {
    if (schema.fields && schema.fields.length > 0) {
      const alreadyGenerated = nestedDtoClasses.some(dto => 
        dto.className === `${schema.name}Dto`
      );
      
      if (!alreadyGenerated) {
        const nestedDto = generateNestedDtoClass(schema);
        nestedDtoClasses.push(nestedDto);
      }
    }
  });

  // Also check fields for embedded schemas that might not be in embeddedSchemas array
  createFields.forEach(field => {
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      const alreadyGenerated = nestedDtoClasses.some(dto => 
        dto.className === `${field.embeddedSchema.name}Dto`
      );
      
      if (!alreadyGenerated) {
        const nestedDto = generateNestedDtoClass(field.embeddedSchema);
        nestedDtoClasses.push(nestedDto);
      }
    }
  });

  // ============================================
  // Second Pass: Generate Main DTO Fields
  // ============================================
  for (const field of createFields) {
    // Skip only auto-generated and system fields - KEEP fields with defaults
    if (field.source === 'system' || field.source === 'auto' || field.source === 'audit') {
      // But keep status field if it's user field with default
      if (field.name === 'status' && field.source === 'user') {
        // Include it
      } else {
        continue;
      }
    }

    // Determine if field should be required in Create DTO
    // Fields with defaults are optional even if marked required in schema
    const isRequiredInCreate = field.isRequiredInCreate === true && !field.hasDefaultValue;

    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: isRequiredInCreate,
    });

    // ============================================
    // Handle Enum Imports (deduplicated)
    // ============================================
    if (field.enumType) {
      // Determine the import path for the enum
      let enumPath = 'src/shared/enums';
      
      if (field.enumImport?.path) {
        enumPath = field.enumImport.path;
      } else {
        // Try to construct path based on entity name
        enumPath = `src/shared/enums/${entity}.enums`;
      }
      
      // Ensure .ts extension is not included in import path
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
      
      extraImports.forEach(imp => {
        const trimmedImp = imp.trim();
        if (!trimmedImp) return;
        
        const validatorDecorators = [
          'IsNotEmpty', 'IsOptional', 'IsString', 'IsNumber', 'IsBoolean', 
          'IsDate', 'IsArray', 'IsEnum', 'IsMongoId', 'Min', 'Max', 
          'MinLength', 'MaxLength', 'Matches', 'ValidateNested', 'ArrayNotEmpty'
        ];
        
        const transformerDecorators = ['Type'];
        
        if (validatorDecorators.includes(trimmedImp)) {
          validatorImports.add(trimmedImp);
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
      .map(v => v.trim())
      .filter(v => v && !v.includes('@Min(null') && !v.includes('@Max(null'));

    // Remove any IsOptional for required fields in create DTO
    if (isRequiredInCreate) {
      validatorDecorators = validatorDecorators.filter(v => !v.includes('@IsOptional'));
    } else {
      // Add IsOptional if not present for optional fields
      if (!validatorDecorators.some(v => v.includes('@IsOptional'))) {
        validatorDecorators.unshift('@IsOptional()');
      }
    }

    // Make sure IsNotEmpty is present for required fields
    if (isRequiredInCreate && !validatorDecorators.some(v => v.includes('@IsNotEmpty'))) {
      validatorDecorators.unshift('@IsNotEmpty()');
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
      .replace(/,(\s*[}])/g, '$1');

    // Handle enum fields with dynamic examples and defaults
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType, field);
      const defaultValue = formatDefaultValue(field);
      
      // Build options array
      const options = [];
      options.push(`enum: ${field.enumType}`);
      
      if (exampleValue) {
        options.push(`example: ${field.enumType}.${exampleValue}`);
      }
      
      if (defaultValue) {
        options.push(`default: ${field.enumType}.${defaultValue}`);
      }
      
      // Add description if available
      if (field.comment) {
        options.push(`description: '${field.comment}'`);
      }
      
      const optionsString = options.join(', ');
      
      // Check if field is required in create DTO
      if (isRequiredInCreate) {
        swaggerDecorator = `@ApiProperty({ ${optionsString} })`;
      } else {
        swaggerDecorator = `@ApiPropertyOptional({ ${optionsString} })`;
      }
      
      // Make sure IsEnum validator is present
      if (!validatorDecorators.some(v => v.includes('@IsEnum'))) {
        validatorDecorators.push(`@IsEnum(${field.enumType})`);
      }
    }

    // Handle embedded schema fields
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      const nestedDtoName = `${field.embeddedSchema.name}Dto`;
      const description = `Embedded ${field.embeddedSchema.name} ${field.isArray ? 'array' : 'object'}`;
      
      if (field.isArray) {
        swaggerDecorator = isRequiredInCreate
          ? `@ApiProperty({ type: () => [${nestedDtoName}], description: '${description}' })`
          : `@ApiPropertyOptional({ type: () => [${nestedDtoName}], description: '${description}' })`;
      } else {
        swaggerDecorator = isRequiredInCreate
          ? `@ApiProperty({ type: () => ${nestedDtoName}, description: '${description}' })`
          : `@ApiPropertyOptional({ type: () => ${nestedDtoName}, description: '${description}' })`;
      }
      
      // Add ValidateNested and Type validators for embedded schemas
      validatorImports.add('ValidateNested');
      transformerImports.add('Type');

      // Replace or add Type decorator
      validatorDecorators = validatorDecorators.filter(v => !v.includes('@Type('));
      if (field.isArray) {
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
        if (isRequiredInCreate) {
          validatorDecorators.push('@ArrayNotEmpty()');
          validatorImports.add('ArrayNotEmpty');
        }
      } else {
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      }
    }

    // Handle reference fields
    if (field.isReferenceField && field.refType) {
      swaggerDecorator = swaggerDecorator.replace(
        /description: 'null ID'/,
        `description: '${field.refType} ID'`
      );
    }

    // Handle regular fields with default values
    if (field.hasDefaultValue && field.defaultValue && !field.enumType) {
      // Add default to swagger decorator
      if (swaggerDecorator.includes('@ApiProperty({') && !swaggerDecorator.includes('default:')) {
        swaggerDecorator = swaggerDecorator.replace(
          '})',
          `, default: ${field.defaultValue} })`
        );
      } else if (swaggerDecorator.includes('@ApiPropertyOptional({') && !swaggerDecorator.includes('default:')) {
        swaggerDecorator = swaggerDecorator.replace(
          '})',
          `, default: ${field.defaultValue} })`
        );
      }
    }

    // ============================================
    // Add field documentation
    // ============================================
    if (field.comment && !field.enumType) {
      const fieldTitle = field.name.charAt(0).toUpperCase() + field.name.slice(1);
      const separator = '-'.repeat(fieldTitle.length);
      
      body += `  /**
   * ${fieldTitle}
   * ${separator}
   * ${field.comment}
   */\n`;
    }

    // Determine TypeScript optional syntax
    const tsOptional = !isRequiredInCreate ? '?' : '';
    
    // Determine TypeScript type
    let dtoType = mapped.dtoType || field.tsType;
    
    // For enum fields, ensure the type is the enum type, not string
    if (field.enumType) {
      dtoType = field.enumType;
    }
    
    // For embedded schemas, use the nested DTO class
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      dtoType = `${field.embeddedSchema.name}Dto`;
      if (field.isArray) {
        dtoType += '[]';
      }
    }
    
    body += `  ${swaggerDecorator}\n`;
    
    // Add validators (deduplicate)
    const uniqueValidators = [];
    const validatorSet = new Set();
    validatorDecorators.forEach(v => {
      const normalized = v.replace(/\s+/g, ' ').trim();
      if (!validatorSet.has(normalized)) {
        validatorSet.add(normalized);
        uniqueValidators.push(v);
      }
    });

    uniqueValidators.forEach(v => {
      if (v.trim()) {
        body += `  ${v}\n`;
      }
    });
    
    body += `  ${field.name}${tsOptional}: ${dtoType};\n\n`;
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
    // Parse enum imports to avoid duplicates
    enumImports.forEach(imp => {
      if (imp && imp.trim()) {
        // Try to extract path and enums from import statement
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

  // Add a blank line after imports if we have any
  if (importSection) {
    importSection += '\n';
  }

  // ============================================
  // Generate Decorator Imports
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

  // Add a blank line before class definitions
  if (fileContent) {
    fileContent += '\n';
  }

  // Add nested DTO classes
  nestedDtoClasses.forEach(nestedDto => {
    fileContent += nestedDto.body;
  });

  // Add main DTO class
  fileContent += `\nexport class Create${Entity}Dto {\n${body}}\n`;

  return fileContent;
};