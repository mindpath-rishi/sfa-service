exports.mapType = (type, fieldInfo = {}) => {
  const result = {
    swagger: '',
    validator: '',
    extraImports: new Set(),
    dtoType: type,
    enumInfo: null,
  };

  const isRequired = fieldInfo.isRequired === true;
  const isArray = fieldInfo.isArray || false;
  const isQueryDto = fieldInfo.isQueryDto || false;

  const getArrayItemType = (t) => {
    if (t.endsWith('[]')) return t.slice(0, -2);
    if (t.startsWith('Array<')) return t.slice(6, -1);
    return t;
  };

  const cleanType = getArrayItemType(type);

  const isEnum = () => !!fieldInfo.enumType;

  const toSwaggerType = (t) => {
    const map = {
      string: 'String',
      number: 'Number',
      boolean: 'Boolean',
      date: 'Date',
    };
    return map[t.toLowerCase()] || t;
  };

  /* ======================================================
   * SWAGGER (✅ FIXED HERE)
   * ====================================================== */

  const swaggerDecorator = isRequired ? 'ApiProperty' : 'ApiPropertyOptional';

  // ENUM
  if (isEnum()) {
    const enumType = fieldInfo.enumType;

    if (isArray) {
      result.swagger = `@${swaggerDecorator}({ enum: ${enumType}, isArray: true })`;
    } else {
      result.swagger = `@${swaggerDecorator}({ enum: ${enumType} })`;
    }

    result.extraImports.add(enumType);
  }

  // ARRAY
  else if (isArray) {
    const itemType = getArrayItemType(type);
    const swaggerType = toSwaggerType(itemType);

    result.swagger = `@${swaggerDecorator}({ type: [${swaggerType}] })`;
  }

  // NORMAL TYPE
  else {
    const swaggerType = toSwaggerType(cleanType);

    result.swagger = `@${swaggerDecorator}({ type: ${swaggerType} })`;
  }

  /* ======================================================
   * VALIDATORS
   * ====================================================== */

  const validators = [];

  // Query DTO → ALWAYS optional
  if (isQueryDto) {
    validators.push('@IsOptional()');
    result.extraImports.add('IsOptional');
  } else if (isRequired) {
    validators.push('@IsNotEmpty()');
    result.extraImports.add('IsNotEmpty');
  } else {
    validators.push('@IsOptional()');
    result.extraImports.add('IsOptional');
  }

  // ENUM
  if (isEnum()) {
    if (isArray) {
      validators.push('@IsArray()');
      validators.push(`@IsEnum(${fieldInfo.enumType}, { each: true })`);
      result.extraImports.add('IsArray');
      result.extraImports.add('IsEnum');
    } else {
      validators.push(`@IsEnum(${fieldInfo.enumType})`);
      result.extraImports.add('IsEnum');
    }
  }

  // STRING
  else if (cleanType.toLowerCase() === 'string') {
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

  // NUMBER
  else if (cleanType.toLowerCase() === 'number') {
    if (isArray) {
      validators.push('@IsArray()');
      validators.push('@IsNumber({}, { each: true })');
      result.extraImports.add('IsArray');
      result.extraImports.add('IsNumber');
    } else {
      validators.push('@IsNumber()');
      result.extraImports.add('IsNumber');
    }
  }

  // BOOLEAN
  else if (cleanType.toLowerCase() === 'boolean') {
    validators.push('@IsBoolean()');
    result.extraImports.add('IsBoolean');
  }

  // DATE
  else if (cleanType.toLowerCase() === 'date') {
    validators.push('@IsDate()');
    result.extraImports.add('IsDate');
  }

  /* ======================================================
   * CLEAN VALIDATORS
   * ====================================================== */

  result.validator = [...new Set(validators)].join('\n  ');
  result.extraImports = Array.from(result.extraImports);

  return result;
};
