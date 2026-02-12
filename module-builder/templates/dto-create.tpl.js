// create-dto.hbs - Fixed version with proper nested DTO support
const { mapType } = require('../utils/type-mapper');

module.exports = ({ Entity, dtoFields, classComment, enumImports, entity, embeddedSchemas = [] }) => {
  const swaggerImports = new Set(['ApiProperty', 'ApiPropertyOptional']);
  const validatorImports = new Set(['IsNotEmpty', 'IsOptional']);
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
 * ${Entity} Create DTO
 * ${'='.repeat(Entity.length + 12)}
 * ${classComment}
 * 
 * Used for creating new ${entityName} records
 */
`;
    }
    return `/**
 * ${Entity} Create DTO
 * ====================
 * Data Transfer Object for creating new ${Entity} records
 */
`;
  };

  // ============================================
  // Generate Nested DTO Class for Embedded Schemas
  // ============================================
  const generateNestedDtoClass = (schema) => {
    const className = `${schema.name}Dto`;
    let nestedClassBody = '';
    
    nestedClassBody += `\nexport class ${className} {\n`;

    schema.fields.forEach(field => {
      // Skip system fields
      if (field.name === '_id' || field.name === '__v') {
        return;
      }

      const isRequired = field.propOptions?.required === true;
      
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

      // Clean up validators
      const validators = mapped.validator
        .split('\n')
        .map(v => v.trim())
        .filter(v => v && !v.includes('@Min(null') && !v.includes('@Max(null'));

      // Add validator imports
      if (mapped.extraImports) {
        const extraImports = Array.isArray(mapped.extraImports) 
          ? mapped.extraImports 
          : mapped.extraImports.split(', ').filter(Boolean);
        
        extraImports.forEach(imp => {
          const trimmedImp = imp.trim();
          if (trimmedImp) {
            validatorImports.add(trimmedImp);
          }
        });
      }

      nestedClassBody += `  ${swaggerDecorator}\n`;
      validators.forEach(v => {
        if (v.trim()) {
          nestedClassBody += `  ${v}\n`;
        }
      });
      nestedClassBody += `  ${field.name}${isRequired ? '' : '?'}: ${field.tsType};\n\n`;
    });

    nestedClassBody += `}\n`;
    return { className, body: nestedClassBody };
  };

  body += generateClassDoc();

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
        
        // Add all validators from nested schema fields to imports
        schema.fields.forEach(field => {
          const mapped = mapType(field.tsType, {
            ...field,
            isRequired: field.propOptions?.required === true,
          });
          
          if (mapped.extraImports) {
            const extraImports = Array.isArray(mapped.extraImports) 
              ? mapped.extraImports 
              : mapped.extraImports.split(', ').filter(Boolean);
            
            extraImports.forEach(imp => {
              const trimmedImp = imp.trim();
              if (trimmedImp) {
                validatorImports.add(trimmedImp);
              }
            });
          }
        });
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
    // Skip auto-generated and system fields
    if (field.source === 'system' || field.source === 'auto' || field.source === 'audit') {
      continue;
    }

    // Determine if field should be required in Create DTO
    const isRequiredInCreate = field.isRequired === true && !field.isOptional;
    const isOptionalInCreate = field.isOptional || !field.isRequired;

    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: isRequiredInCreate,
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
      
      extraImports.forEach(imp => {
        const trimmedImp = imp.trim();
        if (!trimmedImp) return;
        
        const validatorDecorators = [
          'IsNotEmpty', 'IsOptional', 'IsString', 'IsNumber', 'IsBoolean', 
          'IsDate', 'IsArray', 'IsEnum', 'IsMongoId', 'Min', 'Max', 
          'MinLength', 'MaxLength', 'Matches', 'ValidateNested'
        ];
        
        const transformerDecorators = ['Type'];
        
        if (validatorDecorators.includes(trimmedImp)) {
          validatorImports.add(trimmedImp);
        } else if (transformerDecorators.includes(trimmedImp)) {
          transformerImports.add(trimmedImp);
        } else if (/^[A-Z]/.test(trimmedImp) && !trimmedImp.includes('.')) {
          if (trimmedImp.includes('Status') || trimmedImp.includes('Enum') || trimmedImp.includes('Type')) {
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
      .map(v => v.trim())
      .filter(v => v && !v.includes('@Min(null') && !v.includes('@Max(null'));

    // Remove duplicate IsOptional if it exists (shouldn't be in create DTO anyway)
    validatorDecorators = validatorDecorators.filter(v => !v.includes('@IsOptional'));

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

    // Handle enum fields
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType);
      if (swaggerDecorator.includes('@ApiProperty(')) {
        swaggerDecorator = `@ApiProperty({ enum: ${field.enumType}, example: ${field.enumType}.${exampleValue} })`;
      } else {
        swaggerDecorator = `@ApiPropertyOptional({ enum: ${field.enumType}, example: ${field.enumType}.${exampleValue} })`;
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
      if (!validatorImports.has('ValidateNested')) {
        validatorImports.add('ValidateNested');
      }
      if (!transformerImports.has('Type')) {
        transformerImports.add('Type');
      }

      // Replace Type decorator to use the nested DTO class
      validatorDecorators = validatorDecorators.filter(v => !v.includes('@Type('));
      if (field.isArray) {
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      } else {
        validatorDecorators.push(`@Type(() => ${nestedDtoName})`);
      }
    }

    // Handle description for reference fields
    if (field.isReferenceField && field.refType) {
      // Fix the "null ID" description
      swaggerDecorator = swaggerDecorator.replace(
        /description: 'null ID'/,
        `description: '${field.refType} ID'`
      );
    }

    // ============================================
    // Add field documentation
    // ============================================
    if (field.comment) {
      const fieldTitle = field.name.charAt(0).toUpperCase() + field.name.slice(1);
      const separator = '-'.repeat(fieldTitle.length);
      
      body += `  /**
   * ${fieldTitle}
   * ${separator}
   * ${field.comment}
   */\n`;
    }

    // Determine TypeScript optional syntax
    const tsOptional = isOptionalInCreate ? '?' : '';
    
    // Determine TypeScript type
    let dtoType = mapped.dtoType || field.tsType;
    
    // For embedded schemas, use the nested DTO class
    if (field.isEmbeddedSchemaField && field.embeddedSchema) {
      dtoType = `${field.embeddedSchema.name}Dto`;
      if (field.isArray) {
        dtoType += '[]';
      }
    }
    
    body += `  ${swaggerDecorator}\n`;
    
    // Add validators
    validatorDecorators.forEach(v => {
      if (v.trim()) {
        body += `  ${v}\n`;
      }
    });
    
    body += `  ${field.name}${tsOptional}: ${dtoType};\n\n`;
  }

  // ============================================
  // Generate Import Section
  // ============================================
  let importSection = '';

  // Add enum imports
  const uniqueEnumImports = new Set();
  fieldEnumImports.forEach(imp => {
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
    enumImports.forEach(imp => {
      if (imp && !importSection.includes(imp)) {
        importSection += imp + '\n';
      }
    });
  }

  // Add unique enum imports
  uniqueEnumImports.forEach(imp => {
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

  // Add nested DTO classes
  nestedDtoClasses.forEach(nestedDto => {
    fileContent += nestedDto.body;
  });

  // Add main DTO class
  fileContent += `\nexport class Create${Entity}Dto {\n${body}}\n`;

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