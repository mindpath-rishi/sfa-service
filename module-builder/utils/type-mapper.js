exports.mapType = (type, fieldInfo = {}) => {
  // ============================================
  // Helper function for enum examples - defined inside
  // ============================================
  const getEnumExample = (enumType) => {
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
  };

  const result = {
    swagger: '',
    validator: '',
    extraImports: new Set(),
    dtoType: type,
    enumInfo: null,
    embeddedSchemaInfo: null,
    validationRules: [],
    refType: null,
  };

  const isRequired = fieldInfo.isRequired === true; // Strict check
  const isArray = fieldInfo.isArray || false;
  const isEmbeddedSchema = fieldInfo.isEmbeddedSchemaField || false;
  const isReference = fieldInfo.isReferenceField || false;
  const isObjectId = fieldInfo.isObjectId || false;
  const isUpdateDto = fieldInfo.isUpdateDto || false; // Flag for update DTO
  const isQueryDto = fieldInfo.isQueryDto || false; // Flag for query DTO

  // Helper to determine if type is enum - improved detection
  const isEnum = () => {
    if (fieldInfo.enumType || fieldInfo.enumImport) {
      return true;
    }
    
    const enumPatterns = [
      /^[A-Z][a-zA-Z]*(Status|Type|Role|Category|State|Mode|Level)$/,
      /Enum$/,
      /^[A-Z]+(_[A-Z]+)*$/,
    ];
    
    const cleanType = type.replace('[]', '').replace('Array<', '').replace('>', '');
    return enumPatterns.some(pattern => pattern.test(cleanType));
  };

  const getArrayItemType = (typeString) => {
    if (typeString.endsWith('[]')) {
      return typeString.slice(0, -2);
    }
    if (typeString.startsWith('Array<')) {
      return typeString.slice(6, -1);
    }
    return typeString;
  };

  const cleanType = getArrayItemType(type);
  
  // ============================================
  // Handle Embedded Schema Detection
  // ============================================
  if (isEmbeddedSchema && fieldInfo.embeddedSchema) {
    result.embeddedSchemaInfo = {
      name: cleanType,
      fields: fieldInfo.embeddedSchema.fields,
      schemaName: fieldInfo.embeddedSchema.schemaName,
      isArray: isArray,
    };
  }

  // ============================================
  // Handle Swagger Decorator
  // ============================================
  if (isEmbeddedSchema && fieldInfo.embeddedSchema) {
    // Embedded schema field
    if (isArray) {
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: () => [${cleanType}] })`
        : `@ApiPropertyOptional({ type: () => [${cleanType}] })`;
    } else {
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: () => ${cleanType} })`
        : `@ApiPropertyOptional({ type: () => ${cleanType} })`;
    }
    
    // Add import for the embedded schema class
    if (cleanType) {
      result.extraImports.add(cleanType);
    }
  } else if (isReference) {
    // Reference field (String ID, not MongoDB ObjectId)
    result.refType = fieldInfo.refType || 'Reference';
    
    // Format the reference name for display
    let refDisplayName = result.refType;
    if (refDisplayName.includes('_')) {
      refDisplayName = refDisplayName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
    }
    refDisplayName = refDisplayName
      .replace('master', '')
      .replace('Schema', '')
      .replace('Document', '')
      .replace('Id', '');
    
    if (isArray) {
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: [String], description: 'Array of ${refDisplayName} IDs' })`
        : `@ApiPropertyOptional({ type: [String], description: 'Array of ${refDisplayName} IDs' })`;
    } else {
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: String, description: '${refDisplayName} ID' })`
        : `@ApiPropertyOptional({ type: String, description: '${refDisplayName} ID' })`;
    }
  } else if (isArray) {
    // Array field
    const itemType = getArrayItemType(type);
    
    if (isEnum() && (fieldInfo.enumType || itemType)) {
      // Enum array
      const enumType = fieldInfo.enumType || itemType;
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ enum: ${enumType}, isArray: true })`
        : `@ApiPropertyOptional({ enum: ${enumType}, isArray: true })`;
      
      result.enumInfo = {
        name: enumType,
        importStatement: fieldInfo.enumImport?.statement || null,
        isArray: true,
      };
      
      result.extraImports.add(enumType);
    } else {
      // Regular array
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: [${itemType}] })`
        : `@ApiPropertyOptional({ type: [${itemType}] })`;
      
      // Add type import if it looks like a custom class
      if (itemType && /^[A-Z]/.test(itemType) && 
          !['String', 'Number', 'Boolean', 'Date'].includes(itemType)) {
        result.extraImports.add(itemType);
      }
    }
  } else if (isEnum() && (fieldInfo.enumType || cleanType)) {
    // Enum field (non-array)
    const enumType = fieldInfo.enumType || cleanType;
    const exampleValue = getEnumExample(enumType);
    
    result.swagger = isRequired && !isUpdateDto && !isQueryDto
      ? `@ApiProperty({ enum: ${enumType}, example: ${enumType}.${exampleValue} })`
      : `@ApiPropertyOptional({ enum: ${enumType}, example: ${enumType}.${exampleValue} })`;
    
    result.enumInfo = {
      name: enumType,
      importStatement: fieldInfo.enumImport?.statement || null,
      isArray: false,
    };
    
    result.extraImports.add(enumType);
  } else {
    // Regular field
    let swaggerParams = [];
    
    // Map TypeScript types to Swagger types
    switch (cleanType.toLowerCase()) {
      case 'string':
        swaggerParams.push('type: String');
        break;
      case 'number':
        swaggerParams.push('type: Number');
        break;
      case 'boolean':
        swaggerParams.push('type: Boolean');
        break;
      case 'date':
        swaggerParams.push('type: Date');
        break;
      case 'objectid':
        swaggerParams.push('type: String');
        swaggerParams.push('description: \'MongoDB ObjectId\'');
        break;
      default:
        if (/^[A-Z]/.test(cleanType) && !['String', 'Number', 'Boolean', 'Date', 'ObjectId'].includes(cleanType)) {
          swaggerParams.push(`type: () => ${cleanType}`);
          result.extraImports.add(cleanType);
        } else {
          swaggerParams.push('type: String');
        }
    }
    
    const swaggerParamsString = swaggerParams.join(', ');
    result.swagger = isRequired && !isUpdateDto && !isQueryDto
      ? `@ApiProperty({ ${swaggerParamsString} })`
      : `@ApiPropertyOptional({ ${swaggerParamsString} })`;
  }

  // ============================================
  // Handle Validator Decorators
  // ============================================
  const validators = [];

  // Required/Optional validator - ONLY add IsNotEmpty if it's actually required AND not an update/query DTO
  if (isRequired && !isUpdateDto && !isQueryDto) {
    validators.push('@IsNotEmpty()');
    result.extraImports.add('IsNotEmpty');
  } else {
    validators.push('@IsOptional()');
    result.extraImports.add('IsOptional');
  }

  const baseType = cleanType.toLowerCase();
  const isCustomClass = /^[A-Z]/.test(cleanType) && 
                       !['String', 'Number', 'Boolean', 'Date', 'ObjectId'].includes(cleanType);

  // ============================================
  // Handle Embedded Schema Validation
  // ============================================
  if (isEmbeddedSchema && fieldInfo.embeddedSchema) {
    if (isArray) {
      validators.push('@ValidateNested({ each: true })');
      validators.push(`@Type(() => ${cleanType})`);
      result.extraImports.add('ValidateNested');
      result.extraImports.add('Type');
    } else {
      validators.push('@ValidateNested()');
      validators.push(`@Type(() => ${cleanType})`);
      result.extraImports.add('ValidateNested');
      result.extraImports.add('Type');
    }
  }
  // ============================================
  // Handle Reference Fields (String IDs, NOT ObjectId)
  // ============================================
  else if (isReference) {
    // These are string references, not MongoDB ObjectIds
    if (isArray) {
      validators.push('@IsArray()');
      validators.push('@IsString({ each: true })');
      result.extraImports.add('IsArray');
      result.extraImports.add('IsString');
    } else {
      validators.push('@IsString()');
      result.extraImports.add('IsString');
    }
  }
  // ============================================
  // Handle Actual MongoDB ObjectId Validation (explicit)
  // ============================================
  else if (isObjectId || cleanType === 'objectid' || type.includes('ObjectId')) {
    if (isArray) {
      validators.push('@IsArray()');
      validators.push('@IsMongoId({ each: true })');
      result.extraImports.add('IsArray');
      result.extraImports.add('IsMongoId');
    } else {
      validators.push('@IsMongoId()');
      result.extraImports.add('IsMongoId');
    }
  }
  // ============================================
  // Handle Enum Validation
  // ============================================
  else if (isEnum() && (fieldInfo.enumType || cleanType)) {
    const enumType = fieldInfo.enumType || cleanType;
    
    if (isArray) {
      validators.push('@IsArray()');
      validators.push(`@IsEnum(${enumType}, { each: true })`);
      result.extraImports.add('IsArray');
      result.extraImports.add('IsEnum');
    } else {
      validators.push(`@IsEnum(${enumType})`);
      result.extraImports.add('IsEnum');
    }
  }
  // ============================================
  // Handle Primitive Types
  // ============================================
  else {
    switch (baseType) {
      case 'string':
        if (isArray) {
          validators.push('@IsArray()');
          validators.push('@IsString({ each: true })');
          result.extraImports.add('IsArray');
          result.extraImports.add('IsString');
        } else {
          validators.push('@IsString()');
          result.extraImports.add('IsString');
        }
        
        if (fieldInfo.validation?.minlength) {
          validators.push(`@MinLength(${fieldInfo.validation.minlength})`);
          result.extraImports.add('MinLength');
        }
        if (fieldInfo.validation?.maxlength) {
          validators.push(`@MaxLength(${fieldInfo.validation.maxlength})`);
          result.extraImports.add('MaxLength');
        }
        if (fieldInfo.validation?.pattern) {
          validators.push(`@Matches(/${fieldInfo.validation.pattern}/)`);
          result.extraImports.add('Matches');
        }
        break;

      case 'number':
        if (isArray) {
          validators.push('@IsArray()');
          validators.push('@IsNumber({}, { each: true })');
          result.extraImports.add('IsArray');
          result.extraImports.add('IsNumber');
        } else {
          validators.push('@IsNumber()');
          result.extraImports.add('IsNumber');
        }
        
        if (fieldInfo.validation?.min !== undefined && fieldInfo.validation?.min !== null) {
          validators.push(`@Min(${fieldInfo.validation.min})`);
          result.extraImports.add('Min');
        }
        if (fieldInfo.validation?.max !== undefined && fieldInfo.validation?.max !== null) {
          validators.push(`@Max(${fieldInfo.validation.max})`);
          result.extraImports.add('Max');
        }
        break;

      case 'boolean':
        if (isArray) {
          validators.push('@IsArray()');
          validators.push('@IsBoolean({ each: true })');
          result.extraImports.add('IsArray');
          result.extraImports.add('IsBoolean');
        } else {
          validators.push('@IsBoolean()');
          result.extraImports.add('IsBoolean');
        }
        break;

      case 'date':
        if (isArray) {
          validators.push('@IsArray()');
          validators.push('@IsDate({ each: true })');
          result.extraImports.add('IsArray');
          result.extraImports.add('IsDate');
        } else {
          validators.push('@IsDate()');
          result.extraImports.add('IsDate');
        }
        break;

      default:
        if (isCustomClass) {
          if (isArray) {
            validators.push('@ValidateNested({ each: true })');
            validators.push(`@Type(() => ${cleanType})`);
            result.extraImports.add('ValidateNested');
            result.extraImports.add('Type');
          } else {
            validators.push('@ValidateNested()');
            validators.push(`@Type(() => ${cleanType})`);
            result.extraImports.add('ValidateNested');
            result.extraImports.add('Type');
          }
        } else if (isArray) {
          validators.push('@IsArray()');
          validators.push('@IsString({ each: true })');
          result.extraImports.add('IsArray');
          result.extraImports.add('IsString');
        } else {
          validators.push('@IsString()');
          result.extraImports.add('IsString');
        }
    }
  }

  // ============================================
  // Add custom validation from fieldInfo if exists
  // ============================================
  if (fieldInfo.validation?.validate) {
    const validateContent = fieldInfo.validation.validate;
    const validatorMatch = validateContent.match(/validator:\s*(\w+)/);
    if (validatorMatch) {
      const validatorName = validatorMatch[1];
      validators.push(`@${validatorName}()`);
      result.extraImports.add(validatorName);
    }
  }

  // ============================================
  // Add unique validation for system fields that are unique
  // ============================================
  if (fieldInfo.isUnique && fieldInfo.source === 'user' && !isUpdateDto && !isQueryDto) {
    validators.push('@IsUnique()');
    result.extraImports.add('IsUnique');
  }

  // Filter out any duplicate validators
  const uniqueValidators = [];
  const validatorSet = new Set();
  
  validators.forEach(v => {
    // Normalize the validator string for comparison
    const normalized = v.replace(/\s+/g, ' ').trim();
    if (!validatorSet.has(normalized)) {
      validatorSet.add(normalized);
      uniqueValidators.push(v);
    }
  });

  result.validator = uniqueValidators.filter(Boolean).join('\n  ');
  
  // Convert Set to array for flexible handling
  result.extraImports = Array.from(result.extraImports).sort();
  result.validationRules = uniqueValidators
    .filter(v => v)
    .map(v => v.replace(/[@()]/g, '').replace(/{.*}/, '').trim());

  return result;
};