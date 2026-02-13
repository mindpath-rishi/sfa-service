exports.mapType = (type, fieldInfo = {}) => {
  // ============================================
  // Enhanced enum helper functions
  // ============================================
  
  // Get enum values from fieldInfo or try to infer
  const getEnumValues = (enumType, fieldInfo = {}) => {
    // If we have enum values from the parsed schema
    if (fieldInfo.enumValues && Array.isArray(fieldInfo.enumValues) && fieldInfo.enumValues.length > 0) {
      return fieldInfo.enumValues.map(v => v.value || v);
    }
    
    // If we have enum map
    if (fieldInfo.enumMap) {
      return Object.values(fieldInfo.enumMap);
    }
    
    // Try to get from enum import info
    if (fieldInfo.enumImport && fieldInfo.enumImport.values) {
      return fieldInfo.enumImport.values.map(v => v.value || v);
    }
    
    return [];
  };

  // Get appropriate example for enum type
  const getEnumExample = (enumType, fieldInfo = {}) => {
    // Try to get first value from enum values if available
    const enumValues = getEnumValues(enumType, fieldInfo);
    if (enumValues.length > 0) {
      return enumValues[0];
    }
    
    return null;
  };

  // Format enum values for Swagger description
  const getEnumDescription = (enumType, fieldInfo = {}) => {
    const enumValues = getEnumValues(enumType, fieldInfo);
    if (enumValues.length > 0) {
      return `Available values: ${enumValues.map(v => `'${v}'`).join(', ')}`;
    }
    return '';
  };

  // ============================================
  // Business field name detection
  // ============================================
  const isBusinessIdField = (fieldInfo) => {
    return fieldInfo.isBusinessKey === true || 
           (fieldInfo.name && fieldInfo.name.endsWith('Id') && 
            !fieldInfo.name.startsWith('_') && 
            fieldInfo.name !== 'id' && 
            fieldInfo.name !== '_id' &&
            (fieldInfo.isRequired || fieldInfo.isUnique));
  };

  const getBusinessFieldName = (fieldInfo) => {
    if (fieldInfo.businessFieldName) {
      return fieldInfo.businessFieldName;
    }
    if (fieldInfo.name && fieldInfo.name.endsWith('Id')) {
      return fieldInfo.name;
    }
    return null;
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
    isBusinessIdField: isBusinessIdField(fieldInfo),
    businessFieldName: getBusinessFieldName(fieldInfo),
  };

  const isRequired = fieldInfo.isRequired === true;
  const isArray = fieldInfo.isArray || false;
  const isEmbeddedSchema = fieldInfo.isEmbeddedSchemaField || false;
  const isReference = fieldInfo.isReferenceField || false;
  const isObjectId = fieldInfo.isObjectId || false;
  const isUpdateDto = fieldInfo.isUpdateDto || false;
  const isQueryDto = fieldInfo.isQueryDto || false;

  // Enhanced enum detection
  const isEnum = () => {
    if (fieldInfo.enumType || fieldInfo.enumImport || fieldInfo.enumValues) {
      return true;
    }
    
    const enumPatterns = [
      /^[A-Z][a-zA-Z]*(Status|Type|Role|Category|State|Mode|Level|Direction)$/,
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
  // Handle Swagger Decorator with enhanced enum support
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
    
    if (cleanType) {
      result.extraImports.add(cleanType);
    }
  } else if (isReference) {
    // Reference field
    result.refType = fieldInfo.refType || 'Reference';
    
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
    
    // Check if this is a business ID reference
    const isBusinessRef = result.isBusinessIdField;
    const description = isBusinessRef 
      ? `Business identifier for ${refDisplayName}`
      : `Array of ${refDisplayName} IDs`;
    
    if (isArray) {
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: [String], description: '${description}' })`
        : `@ApiPropertyOptional({ type: [String], description: '${description}' })`;
    } else {
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: String, description: '${description}' })`
        : `@ApiPropertyOptional({ type: String, description: '${description}' })`;
    }
  } else if (isArray) {
    // Array field
    const itemType = getArrayItemType(type);
    
    if (isEnum() && (fieldInfo.enumType || itemType)) {
      // Enum array with enhanced documentation
      const enumType = fieldInfo.enumType || itemType;
      const enumValues = getEnumValues(enumType, fieldInfo);
      const enumDescription = getEnumDescription(enumType, fieldInfo);
      
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ 
  enum: ${enumType}, 
  isArray: true,
  description: '${enumDescription}',
  example: [${enumValues.slice(0, 2).map(v => `'${v}'`).join(', ')}]
})`
        : `@ApiPropertyOptional({ 
  enum: ${enumType}, 
  isArray: true,
  description: '${enumDescription}',
  example: [${enumValues.slice(0, 2).map(v => `'${v}'`).join(', ')}]
})`;
      
      result.enumInfo = {
        name: enumType,
        importStatement: fieldInfo.enumImport?.statement || null,
        isArray: true,
        values: enumValues
      };
      
      result.extraImports.add(enumType);
    } else {
      // Regular array
      result.swagger = isRequired && !isUpdateDto && !isQueryDto
        ? `@ApiProperty({ type: [${itemType}] })`
        : `@ApiPropertyOptional({ type: [${itemType}] })`;
      
      if (itemType && /^[A-Z]/.test(itemType) && 
          !['String', 'Number', 'Boolean', 'Date'].includes(itemType)) {
        result.extraImports.add(itemType);
      }
    }
  } else if (isEnum() && (fieldInfo.enumType || cleanType)) {
    // Enum field with enhanced documentation
    const enumType = fieldInfo.enumType || cleanType;
    const exampleValue = getEnumExample(enumType, fieldInfo);
    const enumValues = getEnumValues(enumType, fieldInfo);
    const enumDescription = getEnumDescription(enumType, fieldInfo);
    
    // Build example string
    const exampleStr = exampleValue 
      ? `example: ${enumType}.${exampleValue},`
      : '';
    
    result.swagger = isRequired && !isUpdateDto && !isQueryDto
      ? `@ApiProperty({ 
  enum: ${enumType}, 
  ${exampleStr}
  description: '${enumDescription}'
})`
      : `@ApiPropertyOptional({ 
  enum: ${enumType}, 
  ${exampleStr}
  description: '${enumDescription}'
})`;
    
    result.enumInfo = {
      name: enumType,
      importStatement: fieldInfo.enumImport?.statement || null,
      isArray: false,
      values: enumValues
    };
    
    result.extraImports.add(enumType);
  } else {
    // Regular field
    let swaggerParams = [];
    let description = '';
    
    // Add special description for business ID fields
    if (result.isBusinessIdField && result.businessFieldName) {
      const fieldName = result.businessFieldName.replace(/Id$/, '');
      description = `Business identifier for ${fieldName}`;
    }
    
    // Map TypeScript types to Swagger types
    switch (cleanType.toLowerCase()) {
      case 'string':
        swaggerParams.push('type: String');
        if (description) swaggerParams.push(`description: '${description}'`);
        break;
      case 'number':
        swaggerParams.push('type: Number');
        if (description) swaggerParams.push(`description: '${description}'`);
        break;
      case 'boolean':
        swaggerParams.push('type: Boolean');
        if (description) swaggerParams.push(`description: '${description}'`);
        break;
      case 'date':
        swaggerParams.push('type: Date');
        if (description) swaggerParams.push(`description: '${description}'`);
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
          if (description) swaggerParams.push(`description: '${description}'`);
        }
    }
    
    const swaggerParamsString = swaggerParams.join(', ');
    result.swagger = isRequired && !isUpdateDto && !isQueryDto
      ? `@ApiProperty({ ${swaggerParamsString} })`
      : `@ApiPropertyOptional({ ${swaggerParamsString} })`;
  }

  // ============================================
  // Handle Validator Decorators with enhanced enum support
  // ============================================
  const validators = [];

  // Required/Optional validator
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
  // Handle Reference Fields (including business IDs)
  // ============================================
  else if (isReference || result.isBusinessIdField) {
    if (isArray) {
      validators.push('@IsArray()');
      validators.push('@IsString({ each: true })');
      result.extraImports.add('IsArray');
      result.extraImports.add('IsString');
    } else {
      validators.push('@IsString()');
      result.extraImports.add('IsString');
    }
    
    // Add custom validation for business ID format if needed
    if (result.isBusinessIdField && fieldInfo.pattern) {
      validators.push(`@Matches(/${fieldInfo.pattern}/)`);
      result.extraImports.add('Matches');
      result.validationRules.push(`Must match format: ${fieldInfo.pattern}`);
    }
  }
  // ============================================
  // Handle ObjectId Validation
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
  // Handle Enhanced Enum Validation
  // ============================================
  else if (isEnum() && (fieldInfo.enumType || cleanType)) {
    const enumType = fieldInfo.enumType || cleanType;
    const enumValues = getEnumValues(enumType, fieldInfo);
    
    if (isArray) {
      validators.push('@IsArray()');
      validators.push(`@IsEnum(${enumType}, { each: true })`);
      result.extraImports.add('IsArray');
      result.extraImports.add('IsEnum');
      
      // Add validation rule for documentation
      if (enumValues.length > 0) {
        result.validationRules.push(`Each value must be one of: ${enumValues.join(', ')}`);
      }
    } else {
      validators.push(`@IsEnum(${enumType})`);
      result.extraImports.add('IsEnum');
      
      // Add validation rule for documentation
      if (enumValues.length > 0) {
        result.validationRules.push(`Must be one of: ${enumValues.join(', ')}`);
      }
    }
    
    // Add enum values to fieldInfo for later use
    result.enumInfo = {
      ...result.enumInfo,
      values: enumValues
    };
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
          result.validationRules.push(`Minimum length: ${fieldInfo.validation.minlength}`);
        }
        if (fieldInfo.validation?.maxlength) {
          validators.push(`@MaxLength(${fieldInfo.validation.maxlength})`);
          result.extraImports.add('MaxLength');
          result.validationRules.push(`Maximum length: ${fieldInfo.validation.maxlength}`);
        }
        if (fieldInfo.validation?.pattern) {
          validators.push(`@Matches(/${fieldInfo.validation.pattern}/)`);
          result.extraImports.add('Matches');
          result.validationRules.push(`Must match pattern: ${fieldInfo.validation.pattern}`);
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
          result.validationRules.push(`Minimum value: ${fieldInfo.validation.min}`);
        }
        if (fieldInfo.validation?.max !== undefined && fieldInfo.validation?.max !== null) {
          validators.push(`@Max(${fieldInfo.validation.max})`);
          result.extraImports.add('Max');
          result.validationRules.push(`Maximum value: ${fieldInfo.validation.max}`);
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
  // Add unique validation for system fields and business IDs
  // ============================================
  if (fieldInfo.isUnique && fieldInfo.source === 'user' && !isUpdateDto && !isQueryDto) {
    validators.push('@IsUnique()');
    result.extraImports.add('IsUnique');
    result.validationRules.push('Must be unique');
  }

  // Filter out any duplicate validators
  const uniqueValidators = [];
  const validatorSet = new Set();
  
  validators.forEach(v => {
    const normalized = v.replace(/\s+/g, ' ').trim();
    if (!validatorSet.has(normalized)) {
      validatorSet.add(normalized);
      uniqueValidators.push(v);
    }
  });

  result.validator = uniqueValidators.filter(Boolean).join('\n  ');
  
  // Convert Set to array for flexible handling
  result.extraImports = Array.from(result.extraImports).sort();
  
  // Add any additional validation rules from fieldInfo
  if (fieldInfo.validation?.customRules) {
    result.validationRules.push(...fieldInfo.validation.customRules);
  }

  return result;
};