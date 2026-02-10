// update-dto.hbs - Generic version
const { mapType } = require('../utils/type-mapper');

module.exports = ({ Entity, dtoFields, classComment, enumImports, entity }) => {
  const swaggerImports = new Set(['ApiPropertyOptional']);
  const validatorImports = new Set(['IsOptional']);
  const fieldEnumImports = new Set();
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

  body += generateClassDoc();

  // Get fields for Update DTO
  const updateFields = dtoFields?.update || [];

  for (const field of updateFields) {
    // All fields are optional in Update DTO
    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: false,
    });

    // Store enum import if exists
    if (mapped.enumInfo?.importStatement) {
      fieldEnumImports.add(mapped.enumInfo.importStatement);
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

export class Update${Entity}Dto {
${body}
}
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