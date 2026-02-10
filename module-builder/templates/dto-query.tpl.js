// query-dto.hbs - Fixed version with searchText
const { mapType } = require('../utils/type-mapper');

module.exports = ({ Entity, queryFields, classComment, enumImports, entity }) => {
  const swaggerImports = new Set(['ApiPropertyOptional']);
  const validatorImports = new Set(['IsOptional']);
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

  body += generateClassDoc();

  // Add extends clause
  body += `export class ${Entity}QueryDto extends PaginationDto {\n`;

  // Get query fields - if none provided, use default search fields
  const fieldsToUse = queryFields && queryFields.length > 0 ? queryFields : [];

  // Always include searchText field for generic searching
  const hasSearchText = fieldsToUse.some(f => f.name === 'searchText');
  if (!hasSearchText) {
    // Add default searchText field
    fieldsToUse.unshift({
      name: 'searchText',
      tsType: 'string',
      isOptional: true,
      comment: 'Search by name, code, or identifier'
    });
  }

  // Always include status field if entity has status enum
  const hasStatusField = fieldsToUse.some(f => f.name === 'status');
  const statusEnum = enumImports?.find(imp => imp.includes('Status'));
  if (!hasStatusField && statusEnum) {
    // Extract enum name from import statement
    const enumMatch = statusEnum.match(/import\s*{([^}]+)}\s*from/);
    if (enumMatch) {
      const enumNames = enumMatch[1].split(',').map(e => e.trim());
      const statusEnumName = enumNames.find(e => e.includes('Status'));
      
      if (statusEnumName) {
        fieldsToUse.push({
          name: 'status',
          tsType: statusEnumName,
          isOptional: true,
          comment: 'Filter by status',
          enumType: statusEnumName,
          enumImport: { statement: statusEnum }
        });
      }
    }
  }

  for (const field of fieldsToUse) {
    // All fields are optional in Query DTO
    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: false,
    });

    // Store enum import if exists
    if (mapped.enumInfo?.importStatement) {
      fieldEnumImports.add(mapped.enumInfo.importStatement);
    } else if (field.enumImport?.statement) {
      fieldEnumImports.add(field.enumImport.statement);
    }

    // Add field documentation
    if (field.comment) {
      const fieldTitle = field.name.charAt(0).toUpperCase() + field.name.slice(1);
      const separator = '-'.repeat(fieldTitle.length);
      
      body += `  /**
   * ${fieldTitle}
   * ${separator}
   * ${field.comment}
   */\n`;
    }

    // Add validator imports (excluding IsOptional)
    if (mapped.extraImports) {
      mapped.extraImports.split(', ').forEach(imp => {
        const trimmed = imp.trim();
        if (trimmed && trimmed !== 'IsOptional') {
          validatorImports.add(trimmed);
        }
      });
    }

    // Extract validator names from decorator string
    const validatorNames = mapped.validator.match(/@(\w+)/g);
    if (validatorNames) {
      validatorNames.forEach(v => {
        const name = v.replace('@', '').replace(/\(.*\)/, '');
        if (name !== 'IsOptional') {
          validatorImports.add(name);
        }
      });
    }

    // Enhance swagger decorator for enums
    let swaggerDecorator = mapped.swagger;
    if (field.enumType && swaggerDecorator.includes('ApiPropertyOptional')) {
      const exampleValue = getEnumExample(field.enumType);
      swaggerDecorator = `@ApiPropertyOptional({ example: ${field.enumType}.${exampleValue}, enum: ${field.enumType} })`;
    }

    // Special handling for searchText - make it more descriptive
    if (field.name === 'searchText') {
      swaggerDecorator = '@ApiPropertyOptional({ description: "Search by name, code, or identifier" })';
    }

    body += `
  ${swaggerDecorator}
  ${mapped.validator}
  ${field.name}?: ${mapped.dtoType || field.tsType};
`;
  }

  // Combine all enum imports
  const allEnumImports = new Set([
    ...(enumImports || []),
    ...Array.from(fieldEnumImports).filter(Boolean)
  ]);

  const importSection = allEnumImports.size > 0 
    ? Array.from(allEnumImports).join('\n') + '\n\n' 
    : '';

  return `${importSection}import { ${Array.from(swaggerImports).join(', ')} } from '@nestjs/swagger';
import { ${Array.from(validatorImports).join(', ')} } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

${body}}
`;
};

// Dynamic enum example generator
function getEnumExample(enumType) {
  const patterns = [
    { pattern: /Status$/, example: 'ACTIVE' },
    { pattern: /Type$/, example: 'DEFAULT' },
    { pattern: /Role$/, example: 'USER' },
    { pattern: /Gender$/, example: 'MALE' },
    { pattern: /Priority$/, example: 'MEDIUM' },
    { pattern: /State$/, example: 'ACTIVE' },
  ];

  for (const { pattern, example } of patterns) {
    if (pattern.test(enumType)) {
      return example;
    }
  }

  return 'ACTIVE';
}