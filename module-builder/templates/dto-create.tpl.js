// create-dto.hbs - Generic version
const { mapType } = require('../utils/type-mapper');

module.exports = ({ Entity, dtoFields, classComment, enumImports, entity }) => {
  const swaggerImports = new Set();
  const validatorImports = new Set();
  const fieldEnumImports = new Set();
  let body = '';

  // Generate dynamic class documentation
  const generateClassDoc = () => {
    if (classComment) {
      const entityName = entity || Entity.toLowerCase();
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

  body += generateClassDoc();

  // Get fields for Create DTO
  const createFields = dtoFields?.create || [];

  for (const field of createFields) {
    // Determine if field should be required in Create DTO
    const isRequiredInCreate = !field.isOptional; // All non-optional fields are required in Create DTO

    // Get validation mapping
    const mapped = mapType(field.tsType, {
      ...field,
      isRequired: isRequiredInCreate,
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

    // Determine swagger import based on mapped.swagger
    const hasApiPropertyOptional = mapped.swagger.includes('ApiPropertyOptional');
    const hasApiProperty = mapped.swagger.includes('ApiProperty(');
    
    if (hasApiPropertyOptional) {
      swaggerImports.add('ApiPropertyOptional');
    } else if (hasApiProperty) {
      swaggerImports.add('ApiProperty');
    }

    // Add validator imports from mapped result
    if (mapped.extraImports) {
      mapped.extraImports.split(', ').forEach(imp => {
        if (imp.trim()) validatorImports.add(imp.trim());
      });
    }

    // Extract validator names from decorator string
    const validatorNames = mapped.validator.match(/@(\w+)/g);
    if (validatorNames) {
      validatorNames.forEach(v => {
        const name = v.replace('@', '').replace(/\(.*\)/, '');
        validatorImports.add(name);
      });
    }

    // Enhance swagger decorator for enums with example
    let swaggerDecorator = mapped.swagger;
    if (field.enumType) {
      const exampleValue = getEnumExample(field.enumType);
      if (swaggerDecorator.includes('@ApiProperty(')) {
        swaggerDecorator = `@ApiProperty({ example: ${field.enumType}.${exampleValue}, enum: ${field.enumType} })`;
      } else if (swaggerDecorator.includes('@ApiPropertyOptional(')) {
        swaggerDecorator = `@ApiPropertyOptional({ example: ${field.enumType}.${exampleValue}, enum: ${field.enumType} })`;
      }
    }

    // Determine TypeScript optional syntax
    const tsOptional = field.isOptional ? '?' : '';
    
    body += `
  ${swaggerDecorator}
  ${mapped.validator}
  ${field.name}${tsOptional}: ${mapped.dtoType || field.tsType};
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

export class Create${Entity}Dto {
${body}
}
`;
};

// Dynamic enum example generator
function getEnumExample(enumType) {
  // Try to get example from enum name patterns
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

  // Default examples for common enums
  const commonExamples = {
    CountryStatus: 'ACTIVE',
    ProvinceStatus: 'ACTIVE',
    VanStatus: 'ACTIVE',
    ProductStatus: 'ACTIVE',
    UserStatus: 'ACTIVE',
    OrderStatus: 'PENDING',
    PaymentStatus: 'PENDING',
  };

  return commonExamples[enumType] || 'ACTIVE';
}