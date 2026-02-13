// query-dto.hbs - Updated with create-dto improvements
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
  const enumImportsMap = new Map(); // Track enum imports by path to avoid duplicates
  let body = '';

  // Generate dynamic class documentation
  const generateClassDoc = () => {
    const entityName = entity || Entity.toLowerCase();

    if (classComment) {
      return `/**
 * ${Entity}QueryDto
 * =================
 * ${classComment}
 * 
 * Used for: Filtering and searching ${entityName} records
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
`;
    }
    return `/**
 * ${Entity}QueryDto
 * =================
 * Data Transfer Object for querying ${Entity} records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
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

  // Get query fields - if none provided, use empty array
  let fieldsToUse =
    queryFields && queryFields.length > 0
      ? queryFields.filter((f) => !f.isEmbeddedSchemaField)
      : [];

  // Define searchText field - ALWAYS INCLUDED
  const searchField = {
    name: 'searchText',
    tsType: 'string',
    isOptional: true,
    comment: 'Search by name, code, or identifier (supports partial matching)',
    source: 'query',
    validation: {},
    isSearchable: true
  };
  
  // Create a Set to track field names and avoid duplicates
  const fieldNames = new Set(fieldsToUse.map(f => f.name));
  
  // Only add searchText if it doesn't already exist
  if (!fieldNames.has('searchText')) {
    fieldsToUse = [searchField, ...fieldsToUse];
  }

  // Add class declaration with documentation
  body += generateClassDoc();
  body += `export class ${Entity}QueryDto extends PaginationDto {\n`;

  // Process each field
  for (const field of fieldsToUse) {
    // For query DTO, we want to include:
    // - All user fields that make sense for filtering
    // - ID fields (even if system-generated)
    // - Status fields
    // - Date fields for range queries
    // - Enum fields for exact matching
    // - ALWAYS include searchText
    
    const isRelevantForQuery = 
      field.name === 'searchText' || // Always include searchText
      field.source === 'user' ||
      field.name.includes('Id') ||
      field.name === 'status' ||
      field.name.includes('Date') ||
      field.name.includes('At') ||
      field.enumType;

    if (!isRelevantForQuery) {
      continue;
    }

    // All fields are optional in Query DTO
    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: false,
      isOptional: true,
      isQueryDto: true,
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
      .map((v) => v.trim())
      .filter(
        (v) =>
          v &&
          !v.includes('@IsNotEmpty') &&
          !v.includes('@Min(null') &&
          !v.includes('@Max(null'),
      );

    // Remove any IsOptional and add a single one at the beginning
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

    // Ensure it's ApiPropertyOptional for query DTO
    if (!swaggerDecorator.includes('@ApiPropertyOptional')) {
      swaggerDecorator = swaggerDecorator.replace(
        '@ApiProperty',
        '@ApiPropertyOptional',
      );
    }

    // Handle enum fields with dynamic examples
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType, field);
      const defaultValue = formatDefaultValue(field);
      
      const options = [];
      options.push(`enum: ${field.enumType}`);
      options.push(`description: 'Filter by ${field.name}'`);
      
      if (exampleValue) {
        options.push(`example: ${field.enumType}.${exampleValue}`);
      }
      
      if (defaultValue) {
        options.push(`default: ${field.enumType}.${defaultValue}`);
      }
      
      const optionsString = options.join(', ');
      swaggerDecorator = `@ApiPropertyOptional({ ${optionsString} })`;
      
      // Add IsEnum validator
      if (!validatorDecorators.some(v => v.includes('@IsEnum'))) {
        validatorDecorators.push(`@IsEnum(${field.enumType})`);
      }
    }

    // Special handling for searchText - ALWAYS APPLIED
    if (field.name === 'searchText') {
      swaggerDecorator = '@ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })';
      
      // Override validators for searchText
      validatorDecorators = [
        '@IsOptional()',
        '@IsString()',
        '@MinLength(2)',
        '@MaxLength(100)'
      ];
      
      // Add required imports
      validatorImports.add('IsString');
      validatorImports.add('MinLength');
      validatorImports.add('MaxLength');
      
      // Add validation rules
      if (!result) var result = { validationRules: [] };
      result.validationRules = result.validationRules || [];
      result.validationRules.push('Minimum length: 2 characters');
      result.validationRules.push('Maximum length: 100 characters');
    }

    // Special handling for ID fields
    if (field.name.includes('Id') && field.name !== 'searchText' && field.name !== 'id') {
      if (!swaggerDecorator.includes('description:')) {
        const idName = field.name.replace(/Id$/, '');
        const displayName = idName || 'record';
        swaggerDecorator = swaggerDecorator.replace(
          '})',
          `, description: 'Filter by ${displayName} ID' })`
        );
      }
      
      // Ensure string validator for ID fields
      if (!validatorDecorators.some(v => v.includes('@IsString'))) {
        validatorDecorators.push('@IsString()');
        validatorImports.add('IsString');
      }
    }

    // Handle date range fields
    if ((field.name.includes('Date') || field.name.includes('At')) && field.name !== 'searchText') {
      swaggerDecorator = swaggerDecorator.replace(
        '})',
        ', description: "Filter by date range (supports operators: gt, gte, lt, lte)", example: "2024-01-01T00:00:00.000Z" })'
      );
      
      // Add date validator
      if (!validatorDecorators.some(v => v.includes('@IsDate'))) {
        validatorDecorators.push('@IsDate()');
        validatorImports.add('IsDate');
      }
    }

    // Handle status field
    if (field.name === 'status' && !field.enumType) {
      swaggerDecorator = '@ApiPropertyOptional({ description: "Filter by status", example: "ACTIVE" })';
    }

    // Handle number fields with range support
    if (field.tsType && field.tsType.toLowerCase() === 'number' && !field.enumType && field.name !== 'searchText') {
      swaggerDecorator = swaggerDecorator.replace(
        '})',
        ', description: "Supports operators: gt, gte, lt, lte", example: 10 })'
      );
    }

    // ============================================
    // Add field documentation
    // ============================================
    if (field.comment && field.name !== 'searchText') {
      const fieldTitle = field.name.charAt(0).toUpperCase() + field.name.slice(1);
      const separator = '-'.repeat(fieldTitle.length);

      body += `  /**
   * ${fieldTitle}
   * ${separator}
   * ${field.comment}
   */\n`;
    }

    // For searchText, add documentation if not present
    if (field.name === 'searchText' && !field.comment) {
      body += `  /**
   * Search Text
   * -----------
   * Search by name, code, or identifier (supports partial matching)
   * Minimum 2 characters, maximum 100 characters
   */\n`;
    }

    // Determine TypeScript type
    let dtoType = mapped.dtoType || field.tsType;
    
    // For enum fields, use the enum type
    if (field.enumType) {
      dtoType = field.enumType;
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

  // Ensure searchText is always present even if no fields were processed
  if (!fieldsToUse.some(f => f.name === 'searchText')) {
    const searchFieldDef = {
      name: 'searchText',
      tsType: 'string',
      isOptional: true,
    };
    
    body += `  /**
   * Search Text
   * -----------
   * Search by name, code, or identifier (supports partial matching)
   * Minimum 2 characters, maximum 100 characters
   */
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;\n\n`;
    
    // Add required imports
    validatorImports.add('IsString');
    validatorImports.add('MinLength');
    validatorImports.add('MaxLength');
  }

  // Close the class
  body += `}`;

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

  // Add any additional enum imports from parameters
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

  // Add PaginationDto import
  fileContent += `import { PaginationDto } from 'src/shared/dto/pagination.dto';\n\n`;

  // Add the class body
  fileContent += body;

  return fileContent;
};