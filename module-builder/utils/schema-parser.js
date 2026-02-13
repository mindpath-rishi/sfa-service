const fs = require('fs');
const path = require('path');

exports.parseSchema = (ROOT, entity) => {
  // kebab-case → PascalCase (customer-category → CustomerCategory)
  const toPascalCase = (str) =>
    str
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');

  // kebab-case → CONSTANT_CASE (customer-category → CUSTOMER_CATEGORY)
  const toConstantCase = (str) => str.replace(/-/g, '_').toUpperCase();

  // kebab-case → camelCase (customer-category → customerCategory)
  const toCamelCase = (str) =>
    str
      .split('-')
      .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
      .join('');

  const camelEntity = toCamelCase(entity);

  const Entity = toPascalCase(entity);
  const ENTITY = toConstantCase(entity);

  const schemaPath = path.join(
    process.cwd(),
    'src/core/database/mongo/schema',
    `${entity}.schema.ts`,
  );

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema not found: ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');

  // ============================================
  // PHASE 1: Parse all imports with advanced detection
  // ============================================
  const imports = {
    all: [],
    enums: new Map(),
    types: new Map(),
    schemas: new Map(),
    fromPaths: new Map(),
    decorators: new Map(),
  };

  const importPatterns = [
    /import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g,
    /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+(\w+),\s*{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g,
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(schema)) !== null) {
      const importStatement = match[0];
      imports.all.push(importStatement);

      const importPath = match[match.length - 1];

      let importedItems = [];

      if (match[1] && match[1].includes('{')) {
        const itemsMatch = match[1].match(/{([^}]+)}/);
        if (itemsMatch) {
          importedItems = itemsMatch[1].split(',').map((item) => item.trim());
        }
      } else if (match[1]) {
        importedItems = [match[1].trim()];
      }

      if (match[2] && !match[2].includes('{')) {
        const additionalItems = match[2].split(',').map((item) => item.trim());
        importedItems.push(...additionalItems);
      }

      importedItems.forEach((item) => {
        if (!item) return;

        const importInfo = {
          name: item,
          path: importPath,
          statement: `import { ${item} } from '${importPath}';`,
          isEnum: false,
          isSchema: false,
          isType: false,
          isDecorator: false,
        };

        if (importPath.includes('/enums/') || importPath.includes('.enum')) {
          importInfo.isEnum = true;
          imports.enums.set(item, importInfo);
        } else if (
          importPath.includes('/schemas/') ||
          importPath.includes('.schema')
        ) {
          importInfo.isSchema = true;
          imports.schemas.set(item, importInfo);
        } else if (
          item.endsWith('Type') ||
          item.endsWith('Interface') ||
          item.match(/[A-Z][a-z]+Dto/)
        ) {
          importInfo.isType = true;
          imports.types.set(item, importInfo);
        } else if (
          importPath.includes('/decorators/') ||
          item.match(/[A-Z][a-z]+Decorator/)
        ) {
          importInfo.isDecorator = true;
          imports.decorators.set(item, importInfo);
        }

        if (!imports.fromPaths.has(importPath)) {
          imports.fromPaths.set(importPath, new Set());
        }
        imports.fromPaths.get(importPath).add(item);
      });
    }
  }

  // ============================================
  // PHASE 1.5: Load actual enum values from enum files
  // ============================================
  const loadEnumValues = (enumName, enumImport) => {
    try {
      if (!enumImport) return null;
      
      // Resolve enum file path
      let enumPath = enumImport.path;
      if (enumPath.startsWith('.')) {
        enumPath = path.resolve(path.dirname(schemaPath), enumPath);
      } else if (enumPath.startsWith('src/')) {
        enumPath = path.join(process.cwd(), enumPath);
      }
      
      if (!enumPath.endsWith('.ts') && !enumPath.endsWith('.js')) {
        enumPath += '.ts';
      }
      
      if (!fs.existsSync(enumPath)) {
        return null;
      }
      
      const enumContent = fs.readFileSync(enumPath, 'utf8');
      
      // Find the specific enum
      const enumRegex = new RegExp(`export\\s+enum\\s+${enumName}\\s*{([\\s\\S]*?)}`, 'm');
      const enumMatch = enumContent.match(enumRegex);
      
      if (!enumMatch) return null;
      
      const enumBody = enumMatch[1];
      const enumValues = [];
      const enumMap = {};
      const enumList = [];
      
      const lines = enumBody.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
        
        // Pattern: KEY = 'value',
        const stringMatch = trimmed.match(/^(\w+)\s*=\s*['"]([^'"]+)['"],?/);
        if (stringMatch) {
          const key = stringMatch[1];
          const value = stringMatch[2];
          enumValues.push({ key, value });
          enumMap[key] = value;
          enumList.push(value);
          continue;
        }
        
        // Pattern: KEY = value,
        const numericMatch = trimmed.match(/^(\w+)\s*=\s*(\d+),?/);
        if (numericMatch) {
          const key = numericMatch[1];
          const value = parseInt(numericMatch[2], 10);
          enumValues.push({ key, value });
          enumMap[key] = value;
          enumList.push(value);
          continue;
        }
        
        // Pattern: KEY,
        const simpleMatch = trimmed.match(/^(\w+),?$/);
        if (simpleMatch) {
          const key = simpleMatch[1];
          const value = key;
          enumValues.push({ key, value });
          enumMap[key] = value;
          enumList.push(value);
        }
      }
      
      return {
        name: enumName,
        values: enumValues,
        map: enumMap,
        list: enumList
      };
    } catch (error) {
      console.error(`Error loading enum ${enumName}:`, error);
      return null;
    }
  };

  // ============================================
  // PHASE 2: Extract main schema class body
  // ============================================
  const mainSchemaRegex = new RegExp(
    `export\\s+class\\s+${Entity}\\s*{([\\s\\S]*?)^}`,
    'm',
  );
  const mainSchemaMatch = schema.match(mainSchemaRegex);

  if (!mainSchemaMatch) {
    throw new Error(`Could not find main schema class: ${Entity}`);
  }

  const mainSchemaBody = mainSchemaMatch[1];

  // ============================================
  // PHASE 3: Parse embedded schemas (other class definitions)
  // ============================================
  const embeddedSchemas = [];

  // Find all other class definitions (embedded schemas)
  const classRegex = /export\s+class\s+(\w+)\s*{([\s\S]*?)^}/gm;
  let classMatch;

  while ((classMatch = classRegex.exec(schema)) !== null) {
    const className = classMatch[1];
    const classBody = classMatch[2];

    // Skip the main schema class
    if (className === Entity) {
      continue;
    }

    // Check if this class has @Schema decorator or is referenced in main schema
    const classPosition = classMatch.index;
    const hasSchemaDecorator = schema
      .slice(0, classPosition)
      .includes('@Schema(');

    // Also check if this class is referenced in main schema
    const isReferenced =
      mainSchemaBody.includes(className) ||
      mainSchemaBody.includes(`${className}[]`) ||
      mainSchemaBody.includes(`[${className}Schema]`);

    if (hasSchemaDecorator || isReferenced) {
      const embeddedFields = [];

      // Parse fields in embedded schema
      const embeddedFieldRegex =
        /@Prop\(([\s\S]*?)\)\s*(\w+)\s*(\??)\s*:\s*([^;\n]+);/g;
      let fieldMatch;

      while ((fieldMatch = embeddedFieldRegex.exec(classBody)) !== null) {
        const propContent = fieldMatch[1];
        const fieldName = fieldMatch[2];
        const optionalMark = fieldMatch[3] || '';
        const fieldType = fieldMatch[4].trim();

        // Parse enum info for embedded schema fields
        let enumType = null;
        let enumImport = null;
        let enumValues = null;
        
        const enumMatch = propContent.match(/enum:\s*(\w+)/);
        if (enumMatch) {
          enumType = enumMatch[1];
          if (imports.enums.has(enumType)) {
            enumImport = imports.enums.get(enumType);
            // Load enum values
            const enumData = loadEnumValues(enumType, enumImport);
            if (enumData) {
              enumValues = enumData;
            }
          }
        }

        // Extract default value
        let defaultValue = extractDefaultValue(propContent);
        
        // If default is an enum reference, resolve it
        if (defaultValue && enumType && enumValues) {
          const defaultMatch = defaultValue.match(/^(\w+)\.(\w+)$/);
          if (defaultMatch) {
            const enumRef = defaultMatch[2];
            defaultValue = enumValues.map[enumRef] || defaultValue;
          }
        }

        embeddedFields.push({
          name: fieldName,
          tsType: fieldType,
          rawType: fieldType,
          isOptional: optionalMark === '?',
          isArray: fieldType.endsWith('[]'),
          isRequired: propContent.includes('required: true'),
          isUnique: propContent.includes('unique: true'),
          hasIndex: propContent.includes('index: true'),
          enumType: enumType,
          enumImport: enumImport,
          enumValues: enumValues,
          defaultValue: defaultValue,
          propOptions: {
            required: propContent.includes('required: true'),
            unique: propContent.includes('unique: true'),
            index: propContent.includes('index: true'),
            default: defaultValue,
            enum: enumType,
          },
          comment: null,
          source: 'user',
          dtoInclude: determineDtoInclude(fieldName, '', 'user'),
          validation: {
            required: propContent.includes('required: true'),
            min: extractMin(propContent),
            max: extractMax(propContent),
            minlength: extractMinLength(propContent),
            maxlength: extractMaxLength(propContent),
            pattern: extractPattern(propContent),
          },
          isEmbeddedSchemaField: false,
        });
      }

      embeddedSchemas.push({
        name: className,
        schemaName: `${className}Schema`,
        fields: embeddedFields,
        hasTimestamps: schema
          .slice(0, classPosition)
          .includes('timestamps: true'),
        hasId: !schema.slice(0, classPosition).includes('_id: false'),
      });
    }
  }

  // ============================================
  // PHASE 4: Extract class-level documentation
  // ============================================
  let classComment = null;
  let classPurpose = null;
  let classAudience = null;
  let classNotes = [];

  // Look for JSDoc comment before the main schema class
  const classCommentRegex = new RegExp(
    `\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*export\\s+class\\s+${Entity}`,
    'm',
  );
  const classCommentMatch = schema.match(classCommentRegex);

  if (classCommentMatch) {
    const commentText = classCommentMatch[1];
    classComment = commentText.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

    // Parse structured comments
    const lines = commentText.split('\n');
    let currentSection = null;

    for (const line of lines) {
      const cleanLine = line.replace(/\*/g, '').trim();

      if (!cleanLine) continue;

      if (
        cleanLine.toLowerCase().includes('purpose') &&
        cleanLine.includes(':')
      ) {
        classPurpose = cleanLine.split(':').slice(1).join(':').trim();
      } else if (
        cleanLine.toLowerCase().includes('used by') &&
        cleanLine.includes(':')
      ) {
        classAudience = cleanLine.split(':').slice(1).join(':').trim();
      } else if (
        cleanLine.toLowerCase().includes('note') ||
        cleanLine.toLowerCase().includes('notes')
      ) {
        currentSection = 'notes';
      } else if (cleanLine.includes(':')) {
        currentSection = cleanLine.replace(':', '').trim().toLowerCase();
      } else if (currentSection === 'notes' && cleanLine.startsWith('-')) {
        classNotes.push(cleanLine.substring(1).trim());
      }
    }
  }

  // ============================================
  // PHASE 5: Parse ONLY main schema fields
  // ============================================
  const fields = [];

  // Parse fields only from the main schema body
  const fieldPattern =
    /((?:@\w+\([^)]*\)\s*\n?\s*)*)@Prop\(([\s\S]*?)\)\s*(\w+)\s*(\??)\s*:\s*([^;\n]+);/g;
  let fieldMatch;

  while ((fieldMatch = fieldPattern.exec(mainSchemaBody)) !== null) {
    const allDecorators = fieldMatch[1] || '';
    const propContent = fieldMatch[2];
    const fieldName = fieldMatch[3];
    const optionalMark = fieldMatch[4] || '';
    const rawType = fieldMatch[5].trim();

    // Detect custom decorators
    let hasAutoGenerated = false;
    let hasSystemField = false;
    let hasDtoExclude = false;
    let hasUserInput = false;

    const decoratorLines = allDecorators
      .trim()
      .split(/\s+/)
      .filter((line) => line.startsWith('@'));

    for (const decoratorLine of decoratorLines) {
      const decoratorMatch = decoratorLine.match(/@(\w+)\(/);
      if (decoratorMatch) {
        const decoratorName = decoratorMatch[1];
        switch (decoratorName.toLowerCase()) {
          case 'autogenerated':
          case 'autogenerate':
            hasAutoGenerated = true;
            break;
          case 'systemfield':
          case 'system':
            hasSystemField = true;
            break;
          case 'dtoexclude':
          case 'exclude':
            hasDtoExclude = true;
            break;
          case 'userinput':
          case 'user':
            hasUserInput = true;
            break;
        }
      }
    }

    // Check if this field references an embedded schema
    const isEmbeddedSchemaField = embeddedSchemas.some(
      (es) => rawType === es.name || rawType === `${es.name}[]`,
    );

    // If it's an embedded schema field, add it with special handling
    if (isEmbeddedSchemaField) {
      const embeddedSchema = embeddedSchemas.find(
        (es) => rawType === es.name || rawType === `${es.name}[]`,
      );

      // Determine field source for embedded schema field
      const fieldSource = determineFieldSource(
        allDecorators,
        fieldName,
        propContent,
      );

      // IMPORTANT: Ensure embedded schema fields are included in update DTO
      let dtoInclude = ['create', 'update', 'response']; // Always include in update

      // Override if there are specific decorators
      if (hasDtoExclude) {
        dtoInclude = [];
      } else if (hasUserInput) {
        dtoInclude = ['create', 'update', 'response', 'query'];
      } else if (
        fieldSource === 'system' ||
        fieldSource === 'auto' ||
        fieldSource === 'audit'
      ) {
        // For system fields, only include in response
        dtoInclude = ['response'];
      }

      // Check if field has default value - if yes, it should not be required in create DTO
      const hasDefaultValue = !!extractDefaultValue(propContent);
      const isRequiredInCreate = propContent.includes('required: true') && !hasDefaultValue;

      fields.push({
        name: fieldName,
        tsType: rawType,
        rawType: rawType,
        isOptional: optionalMark === '?' || !propContent.includes('required: true') || hasDefaultValue,
        isArray: rawType.endsWith('[]'),
        isRequired: propContent.includes('required: true'),
        isRequiredInCreate: isRequiredInCreate,
        hasDefaultValue: hasDefaultValue,
        isUnique: propContent.includes('unique: true'),
        hasIndex: propContent.includes('index: true'),
        defaultValue: extractDefaultValue(propContent),
        propOptions: parsePropOptions(propContent),
        comment: extractFieldComment(schema, fieldMatch.index),

        source: fieldSource,
        isSystemGenerated: hasAutoGenerated || fieldSource === 'system',
        isAutoGenerated: hasAutoGenerated || fieldSource === 'auto',
        isAuditField: fieldSource === 'audit',
        dtoInclude: dtoInclude,
        hasAutoGeneratedDecorator: hasAutoGenerated,
        hasSystemFieldDecorator: hasSystemField,
        hasDtoExcludeDecorator: hasDtoExclude,
        hasUserInputDecorator: hasUserInput,

        isEmbeddedSchemaField: true,
        embeddedSchema: embeddedSchema,

        isIdField: fieldName === '_id' || fieldName.endsWith('Id'),
        isTimestampField: ['createdAt', 'updatedAt', 'deletedAt'].includes(
          fieldName,
        ),
        isReferenceField: !!propContent.includes('ref:'),
        isStatusField: fieldName === 'status',
        isBusinessKey:
          propContent.includes('required: true') &&
          propContent.includes('unique: true') &&
          /Id$|Code$|Key$/.test(fieldName),
        isSearchable:
          !fieldName.startsWith('_') &&
          (fieldName === 'name' ||
            fieldName.endsWith('Id') ||
            fieldName === 'status'),

        validation: {
          required: propContent.includes('required: true'),
          min: extractMin(propContent),
          max: extractMax(propContent),
          minlength: extractMinLength(propContent),
          maxlength: extractMaxLength(propContent),
          pattern: extractPattern(propContent),
        },
      });

      continue;
    }

    // Process regular fields (non-embedded)

    // Parse Prop options
    const propOptions = parsePropOptions(propContent);

    const isArray = rawType.endsWith('[]') || propContent.includes('type: [');
    const isTypeScriptOptional = optionalMark === '?';
    const isMongooseRequired = propOptions.required;
    
    // Check if field has default value - if yes, it should not be required in create DTO
    const hasDefaultValue = !!propOptions.default;
    const isOptional = isTypeScriptOptional || !isMongooseRequired || hasDefaultValue;
    const isRequiredInCreate = isMongooseRequired && !hasDefaultValue;

    // Determine TypeScript type and enum info
    let tsType = rawType;
    let enumType = propOptions.enum;
    let enumImport = null;
    let enumValues = null;

    if (!enumType && imports.enums.has(rawType)) {
      enumType = rawType;
    }

    if (enumType && imports.enums.has(enumType)) {
      enumImport = imports.enums.get(enumType);
      // Load actual enum values
      const enumData = loadEnumValues(enumType, enumImport);
      if (enumData) {
        enumValues = enumData;
      }
    }

    if (isArray) {
      if (rawType.endsWith('[]')) {
        const baseType = rawType.slice(0, -2);
        if (imports.enums.has(baseType)) {
          enumType = baseType;
          enumImport = imports.enums.get(baseType);
          // Load actual enum values
          const enumData = loadEnumValues(enumType, enumImport);
          if (enumData) {
            enumValues = enumData;
          }
        }
      }
    }

    // Resolve default value if it's an enum reference
    let defaultValue = propOptions.default;
    if (defaultValue && enumType && enumValues) {
      // Check if default is in format EnumName.VALUE
      const defaultMatch = defaultValue.match(/^(\w+)\.(\w+)$/);
      if (defaultMatch) {
        const enumRef = defaultMatch[2];
        defaultValue = enumValues.map[enumRef] || defaultValue;
      }
    }

    // Handle ref relationships
    let refType = null;
    let refImport = null;
    if (propOptions.ref) {
      const refName = propOptions.ref.replace(/Schema$/, '');
      if (imports.schemas.has(refName)) {
        refType = refName;
        refImport = imports.schemas.get(refName);
      } else if (imports.types.has(refName)) {
        refType = refName;
        refImport = imports.types.get(refName);
      }
    }

    // Determine field source
    const fieldSource = determineFieldSource(
      allDecorators,
      fieldName,
      propContent,
    );
    const isSystemGenerated = hasAutoGenerated || fieldSource === 'system';
    const isAutoGeneratedField = hasAutoGenerated || fieldSource === 'auto';
    const isAuditField = fieldSource === 'audit';

    // Determine DTO inclusion - fields with defaults should NOT be in create DTO
    let dtoInclude = determineDtoInclude(
      fieldName,
      allDecorators,
      fieldSource,
    );

    // If field has default value, remove it from create DTO
    // if (hasDefaultValue && dtoInclude.includes('create')) {
    //   dtoInclude = dtoInclude.filter(type => type !== 'create');
    // }

    // Extract field comment
    const fieldComment = extractFieldComment(schema, fieldMatch.index);

    // Create field object
    const field = {
      name: fieldName,
      tsType: tsType,
      rawType: rawType,
      isOptional: isOptional,
      isArray: isArray,
      isRequired: isMongooseRequired,
      isRequiredInCreate: isRequiredInCreate,
      hasDefaultValue: hasDefaultValue,
      isUnique: propOptions.unique,
      hasIndex: propOptions.index,
      enumType: enumType,
      enumImport: enumImport,
      enumValues: enumValues,
      refType: refType,
      refImport: refImport,
      embeddedSchema: null,
      defaultValue: defaultValue,
      propOptions: propOptions,
      comment: fieldComment,
      validation: {
        required: propOptions.required,
        min: propOptions.min,
        max: propOptions.max,
        minlength: propOptions.minlength,
        maxlength: propOptions.maxlength,
        pattern: propOptions.match,
        validate: propOptions.validate,
      },

      source: fieldSource,
      isSystemGenerated: isSystemGenerated,
      isAutoGenerated: isAutoGeneratedField,
      isAuditField: isAuditField,
      dtoInclude: dtoInclude,
      hasAutoGeneratedDecorator: hasAutoGenerated,
      hasSystemFieldDecorator: hasSystemField,
      hasDtoExcludeDecorator: hasDtoExclude,
      hasUserInputDecorator: hasUserInput,

      isIdField: fieldName === '_id' || fieldName.endsWith('Id'),
      isTimestampField: ['createdAt', 'updatedAt', 'deletedAt'].includes(
        fieldName,
      ),
      isStatusField: fieldName === 'status',
      isReferenceField: !!propOptions.ref,
      isEmbeddedSchemaField: false,
      isBusinessKey:
        propOptions.required &&
        propOptions.unique &&
        /Id$|Code$|Key$/.test(fieldName),
      isSearchable:
        !fieldName.startsWith('_') &&
        (fieldSource === 'user' ||
          (fieldSource === 'system' && fieldName.toLowerCase().includes('id'))),
    };

    fields.push(field);
  }

  // ============================================
  // PHASE 6: Collect unique imports for DTOs
  // ============================================
  const uniqueEnumImports = new Set();
  const uniqueRefImports = new Set();

  fields.forEach((field) => {
    if (field.enumImport) {
      uniqueEnumImports.add(field.enumImport.statement);
    }
    if (field.refImport) {
      uniqueRefImports.add(field.refImport.statement);
    }
  });

  // ============================================
  // PHASE 7: Extract additional metadata
  // ============================================
  const schemaOptions = {
    timestamps:
      mainSchemaBody.includes('timestamps: true') ||
      schema.includes('@Schema({ timestamps: true })'),
    collection: null,
    _id:
      !mainSchemaBody.includes('_id: false') &&
      !schema.includes('@Schema({ _id: false'),
  };

  const collectionMatch = schema.match(
    /@Schema\([^)]*collection:\s*['"]([^'"]+)['"][^)]*\)/,
  );
  if (collectionMatch) {
    schemaOptions.collection = collectionMatch[1];
  }

  // ============================================
  // PHASE 8: Group fields by DTO type - INCLUDE embedded schema fields
  // ============================================
  const dtoFields = {
    create: fields.filter((f) => f.dtoInclude.includes('create')),
    update: fields.filter((f) => f.dtoInclude.includes('update')),
    response: fields.filter((f) => f.dtoInclude.includes('response')),
    query: fields.filter((f) => f.dtoInclude.includes('query')),
  };

  // ============================================
  // PHASE 9: Filter query fields
  // ============================================
  const defaultQueryFields = [
    {
      name: 'searchText',
      tsType: 'string',
      isOptional: true,
      comment: 'Search by name or identifier',
    },
    {
      name: 'status',
      tsType: 'string',
      isOptional: true,
      comment: 'Filter by status',
    },
  ];

  const queryFields =
    dtoFields.query.length > 0 ? dtoFields.query : defaultQueryFields;

  // ============================================
  // Return comprehensive parsing result
  // ============================================
  return {
    // Basic entity info
    entity,
    Entity,
    ENTITY,
    camelEntity,

    // Schema info
    schemaPath,
    schemaOptions,

    // Embedded schemas
    embeddedSchemas,

    // Documentation
    classComment,
    classPurpose,
    classAudience,
    classNotes,

    // All fields
    fields,

    // Grouped by DTO type (INCLUDING embedded schema fields)
    dtoFields,
    queryFields,

    // Field categories (excluding embedded schema fields for regular fields)
    userInputFields: fields.filter(
      (f) => f.source === 'user' && !f.isEmbeddedSchemaField,
    ),
    systemGeneratedFields: fields.filter(
      (f) => f.source === 'system' && !f.isEmbeddedSchemaField,
    ),
    autoGeneratedFields: fields.filter(
      (f) => f.source === 'auto' && !f.isEmbeddedSchemaField,
    ),
    excludedFields: fields.filter(
      (f) => f.source === 'exclude' && !f.isEmbeddedSchemaField,
    ),

    idFields: fields.filter((f) => f.isIdField && !f.isEmbeddedSchemaField),
    requiredFields: fields.filter(
      (f) => f.isRequired && !f.isOptional && !f.isEmbeddedSchemaField,
    ),
    requiredInCreateFields: fields.filter(
      (f) => f.isRequiredInCreate && !f.isEmbeddedSchemaField,
    ),
    optionalFields: fields.filter(
      (f) => f.isOptional && !f.isEmbeddedSchemaField,
    ),
    enumFields: fields.filter((f) => f.enumType && !f.isEmbeddedSchemaField),
    refFields: fields.filter((f) => f.refType && !f.isEmbeddedSchemaField),
    arrayFields: fields.filter((f) => f.isArray && !f.isEmbeddedSchemaField),
    timestampFields: fields.filter(
      (f) => f.isTimestampField && !f.isEmbeddedSchemaField,
    ),
    statusFields: fields.filter(
      (f) => f.isStatusField && !f.isEmbeddedSchemaField,
    ),
    businessKeyFields: fields.filter(
      (f) => f.isBusinessKey && !f.isEmbeddedSchemaField,
    ),
    searchableFields: fields.filter(
      (f) => f.isSearchable && !f.isEmbeddedSchemaField,
    ),
    fieldsWithDefault: fields.filter(
      (f) => f.hasDefaultValue && !f.isEmbeddedSchemaField,
    ),

    // Embedded schema fields (separate category)
    embeddedSchemaFields: fields.filter((f) => f.isEmbeddedSchemaField),

    // Imports
    imports: imports.all,
    enumImports: Array.from(uniqueEnumImports),
    refImports: Array.from(uniqueRefImports),
    importsMap: {
      enums: imports.enums,
      schemas: imports.schemas,
      types: imports.types,
      decorators: imports.decorators,
      fromPaths: imports.fromPaths,
    },

    // Paths
    moduleDir: path.join(ROOT, 'src/modules/v1', entity),
    dtoDir: path.join(ROOT, 'src/modules/v1', entity, 'dto'),
    enumDir: path.join(ROOT, 'src/shared/enums'),
    schemaDir: path.join(process.cwd(), 'src/core/database/mongo/schema'),
    decoratorDir: path.join(process.cwd(), 'src/core/decorators'),

    // Raw data
    rawSchema: schema,
  };
};

// ============================================
// Helper Functions
// ============================================

function parsePropOptions(propContent) {
  const options = {
    raw: propContent,
    type: null,
    required: false,
    unique: false,
    index: false,
    enum: null,
    default: null,
    ref: null,
    validate: null,
    min: null,
    max: null,
    minlength: null,
    maxlength: null,
    match: null,
  };

  const typeMatch = propContent.match(/type:\s*([^,\n}]+)/);
  if (typeMatch) options.type = typeMatch[1].trim();

  const enumMatch = propContent.match(/enum:\s*([^,\n}]+)/);
  if (enumMatch) options.enum = enumMatch[1].trim();

  const refMatch = propContent.match(/ref:\s*['"]([^'"]+)['"]/);
  if (refMatch) {
    options.ref = refMatch[1];
  } else {
    const refMatch2 = propContent.match(/ref:\s*([^,\n}]+)/);
    if (refMatch2) options.ref = refMatch2[1].trim();
  }

  const validateMatch = propContent.match(/validate:\s*({[^}]+})/);
  if (validateMatch) options.validate = validateMatch[1];

  options.required = propContent.includes('required: true');
  options.unique = propContent.includes('unique: true');
  options.index = propContent.includes('index: true');

  const defaultMatch = propContent.match(/default:\s*([^,\n}]+)/);
  if (defaultMatch) options.default = defaultMatch[1].trim();

  const minMatch = propContent.match(/min:\s*([^,\n}]+)/);
  if (minMatch) options.min = minMatch[1].trim();

  const maxMatch = propContent.match(/max:\s*([^,\n}]+)/);
  if (maxMatch) options.max = maxMatch[1].trim();

  const minLengthMatch = propContent.match(/minlength:\s*([^,\n}]+)/);
  if (minLengthMatch) options.minlength = minLengthMatch[1].trim();

  const maxLengthMatch = propContent.match(/maxlength:\s*([^,\n}]+)/);
  if (maxLengthMatch) options.maxlength = maxLengthMatch[1].trim();

  const matchPattern = propContent.match(/match:\s*\/([^\/]+)\//);
  if (matchPattern) options.match = matchPattern[1];

  return options;
}

function extractDefaultValue(propContent) {
  const match = propContent.match(/default:\s*([^,\n}]+)/);
  return match ? match[1].trim() : null;
}

function extractMin(propContent) {
  const match = propContent.match(/min:\s*([^,\n}]+)/);
  return match ? match[1].trim() : null;
}

function extractMax(propContent) {
  const match = propContent.match(/max:\s*([^,\n}]+)/);
  return match ? match[1].trim() : null;
}

function extractMinLength(propContent) {
  const match = propContent.match(/minlength:\s*([^,\n}]+)/);
  return match ? match[1].trim() : null;
}

function extractMaxLength(propContent) {
  const match = propContent.match(/maxlength:\s*([^,\n}]+)/);
  return match ? match[1].trim() : null;
}

function extractPattern(propContent) {
  const match = propContent.match(/match:\s*\/([^\/]+)\//);
  return match ? match[1] : null;
}

function extractFieldComment(schema, fieldIndex) {
  const lines = schema.split('\n');
  let lineIndex = 0;
  let currentIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    currentIndex += lines[i].length + 1;
    if (currentIndex > fieldIndex) {
      lineIndex = i;
      break;
    }
  }

  let commentLines = [];
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('//')) {
      commentLines.unshift(line.substring(2).trim());
    } else if (line.includes('*/')) {
      break;
    } else if (line === '' || line.includes('@')) {
      break;
    } else {
      break;
    }
  }

  return commentLines.length > 0 ? commentLines.join('\n') : null;
}

function determineFieldSource(decorators, fieldName, propContent) {
  if (decorators.includes('@AutoGenerated')) return 'system';
  if (decorators.includes('@SystemField')) return 'system';
  if (decorators.includes('@DtoExclude')) return 'exclude';
  if (decorators.includes('@UserInput')) return 'user';

  const systemPatterns = [
    /^_id$/i,
    /^__v$/i,
    /^createdAt$/i,
    /^updatedAt$/i,
    /^deletedAt$/i,
  ];

  if (systemPatterns.some((p) => p.test(fieldName))) return 'system';

  const autoPatterns = [/At$/i, /On$/i];
  if (
    autoPatterns.some((p) => p.test(fieldName)) &&
    !['createdAt', 'updatedAt', 'deletedAt'].includes(fieldName)
  ) {
    return 'auto';
  }

  const auditPatterns = [
    /^createdBy$/i,
    /^updatedBy$/i,
    /^deletedBy$/i,
    /By$/i,
  ];
  if (auditPatterns.some((p) => p.test(fieldName))) return 'audit';

  return 'user';
}

function determineDtoInclude(fieldName, decorators, source) {
  if (decorators.includes('@DtoExclude')) return [];

  switch (source) {
    case 'user':
      return ['create', 'update', 'response', 'query'];
    case 'system':
      return fieldName.toLowerCase().includes('id') &&
        !fieldName.startsWith('_')
        ? ['response', 'query']
        : ['response'];
    case 'auto':
    case 'audit':
      return ['response'];
    case 'exclude':
      return [];
    default:
      return ['create', 'update', 'response', 'query'];
  }
}