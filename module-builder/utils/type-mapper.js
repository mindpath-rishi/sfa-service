exports.mapType = (type, fieldInfo = {}) => {
  const result = {
    swagger: '',
    validator: '',
    extraImports: new Set(),
    dtoType: type,
    enumInfo: null,
    validationRules: [],
  };

  const isRequired = fieldInfo.isRequired !== false;
  const isArray = fieldInfo.isArray || false;

  // Helper to determine if type is enum
  const isEnum = fieldInfo.enumType || 
                fieldInfo.enumImport || 
                type.match(/[A-Z][a-z]+/) ||
                type.endsWith('Status') ||
                type.endsWith('Type') ||
                type.endsWith('Role');

  // Helper function to extract array item type
  const getArrayItemType = (typeString) => {
    if (typeString.endsWith('[]')) {
      return typeString.slice(0, -2);
    }
    if (typeString.startsWith('Array<')) {
      return typeString.slice(6, -1);
    }
    return typeString;
  };

  // ============================================
  // Handle Swagger Decorator
  // ============================================
  if (isArray) {
    // Array field
    const itemType = getArrayItemType(type);
    
    if (isEnum && fieldInfo.enumType) {
      // Enum array
      result.swagger = isRequired
        ? `@ApiProperty({ type: () => [${fieldInfo.enumType}], isArray: true })`
        : `@ApiPropertyOptional({ type: () => [${fieldInfo.enumType}], isArray: true })`;
      
      result.enumInfo = {
        name: fieldInfo.enumType,
        importStatement: fieldInfo.enumImport?.statement || null,
        isArray: true,
      };
    } else {
      // Regular array
      result.swagger = isRequired
        ? `@ApiProperty({ type: () => [${itemType}], isArray: true })`
        : `@ApiPropertyOptional({ type: () => [${itemType}], isArray: true })`;
    }
  } else if (isEnum && fieldInfo.enumType) {
    // Enum field (non-array)
    result.swagger = isRequired
      ? `@ApiProperty({ enum: ${fieldInfo.enumType} })`
      : `@ApiPropertyOptional({ enum: ${fieldInfo.enumType} })`;
    
    result.enumInfo = {
      name: fieldInfo.enumType,
      importStatement: fieldInfo.enumImport?.statement || null,
      isArray: false,
    };
  } else {
    // Regular field
    result.swagger = isRequired ? '@ApiProperty()' : '@ApiPropertyOptional()';
  }

  // ============================================
  // Handle Validator Decorators
  // ============================================
  const validators = [];

  // Required/Optional validator
  if (isRequired) {
    validators.push('@IsNotEmpty()');
    result.extraImports.add('IsNotEmpty');
  } else {
    validators.push('@IsOptional()');
    result.extraImports.add('IsOptional');
  }

  // Determine the base type for validation
  let baseType = type.toLowerCase();
  if (isArray) {
    baseType = getArrayItemType(type).toLowerCase();
  }

  // Type-specific validators
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
      
      // Add length validators if specified
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
      
      if (fieldInfo.validation?.min) {
        validators.push(`@Min(${fieldInfo.validation.min})`);
        result.extraImports.add('Min');
      }
      if (fieldInfo.validation?.max) {
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
      // Handle enum types
      if (isEnum && fieldInfo.enumType) {
        if (isArray) {
          validators.push('@IsArray()');
          validators.push(`@IsEnum(${fieldInfo.enumType}, { each: true })`);
          result.extraImports.add('IsArray');
          result.extraImports.add('IsEnum');
        } else {
          validators.push(`@IsEnum(${fieldInfo.enumType})`);
          result.extraImports.add('IsEnum');
        }
      } else if (type === 'ObjectId' || type.includes('ObjectId')) {
        // MongoDB ObjectId
        if (isArray) {
          validators.push('@IsArray()');
          validators.push('@IsMongoId({ each: true })');
          result.extraImports.add('IsArray');
          result.extraImports.add('IsMongoId');
        } else {
          validators.push('@IsMongoId()');
          result.extraImports.add('IsMongoId');
        }
      } else {
        // Unknown type - default to string validation
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
  }

  // Add custom validation from fieldInfo if exists
  if (fieldInfo.validation?.validate) {
    const validateContent = fieldInfo.validation.validate;
    // Try to extract validator function names
    const validatorMatch = validateContent.match(/validator:\s*(\w+)/);
    if (validatorMatch) {
      const validatorName = validatorMatch[1];
      validators.push(`@${validatorName}()`);
      result.extraImports.add(validatorName);
    }
  }

  // Add min/max validation for numbers if not already added
  if (baseType === 'number') {
    if (fieldInfo.validation?.min && !validators.some(v => v.includes('@Min'))) {
      validators.push(`@Min(${fieldInfo.validation.min})`);
      result.extraImports.add('Min');
    }
    if (fieldInfo.validation?.max && !validators.some(v => v.includes('@Max'))) {
      validators.push(`@Max(${fieldInfo.validation.max})`);
      result.extraImports.add('Max');
    }
  }

  result.validator = validators.join('\n  ');
  result.extraImports = Array.from(result.extraImports).join(', ');
  
  // Store validation rules for reference
  result.validationRules = validators.map(v => v.replace(/[@()]/g, ''));

  return result;
};