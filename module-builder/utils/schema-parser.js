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
    enums: new Map(), // enum name -> import info
    types: new Map(), // type name -> import info
    schemas: new Map(), // schema name -> import info
    fromPaths: new Map(), // path -> imports
    decorators: new Map(), // decorator imports
  };

  const importPatterns = [
    // Standard import
    /import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g,
    // Default import
    /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
    // Mixed imports
    /import\s+(\w+),\s*{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g,
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(schema)) !== null) {
      const importStatement = match[0];
      imports.all.push(importStatement);

      const importPath = match[match.length - 1];

      // Parse imported items
      let importedItems = [];

      if (match[1] && match[1].includes('{')) {
        // Has named imports { x, y, z }
        const itemsMatch = match[1].match(/{([^}]+)}/);
        if (itemsMatch) {
          importedItems = itemsMatch[1].split(',').map((item) => item.trim());
        }
      } else if (match[1]) {
        // Single default import or named import
        importedItems = [match[1].trim()];
      }

      if (match[2] && !match[2].includes('{')) {
        // Additional named imports from mixed pattern
        const additionalItems = match[2].split(',').map((item) => item.trim());
        importedItems.push(...additionalItems);
      }

      // Categorize imports
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

        // Detect import type
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

        // Track by path
        if (!imports.fromPaths.has(importPath)) {
          imports.fromPaths.set(importPath, new Set());
        }
        imports.fromPaths.get(importPath).add(item);
      });
    }
  }

  // ============================================
  // PHASE 2: Extract class-level documentation
  // ============================================
  let classComment = null;
  let classPurpose = null;
  let classAudience = null;
  let classNotes = [];

  const classCommentMatch = schema.match(
    /\/\*\*([\s\S]*?)\*\/\s*export\s+class\s+\w+/,
  );
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
        // Section header
        currentSection = cleanLine.replace(':', '').trim().toLowerCase();
      } else if (currentSection === 'notes' && cleanLine.startsWith('-')) {
        classNotes.push(cleanLine.substring(1).trim());
      }
    }
  }

  // ============================================
  // PHASE 3: Parse fields with decorator detection
  // ============================================
  const fields = [];

  // Enhanced regex to capture decorators before @Prop
  const fieldPattern =
    /((?:@\w+\([^)]*\)\s*\n?\s*)*)@Prop\(([\s\S]*?)\)\s*([\w\s?:\n[\]]+?);/g;
  let fieldMatch;

  while ((fieldMatch = fieldPattern.exec(schema)) !== null) {
    const allDecorators = fieldMatch[1] || '';
    const propContent = fieldMatch[2];
    const fieldDefinition = fieldMatch[3].trim();

    // Parse field definition
    const fieldRegex = /(\w+)\s*(\??)\s*:\s*([\w<>[\]|]+)/;
    const fieldDefMatch = fieldDefinition.match(fieldRegex);

    if (!fieldDefMatch) continue;

    const [, fieldName, optionalMark, rawType] = fieldDefMatch;

    // ============================================
    // Detect custom decorators
    // ============================================
    const decoratorLines = allDecorators
      .trim()
      .split(/\s+/)
      .filter((line) => line.startsWith('@'));
    let hasAutoGenerated = false;
    let hasSystemField = false;
    let hasDtoExclude = false;
    let hasUserInput = false;

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

    // ============================================
    // Parse @Prop() options
    // ============================================
    const propOptions = {
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

    // Extract type
    const typeMatch = propContent.match(/type:\s*([^,\n}]+)/);
    if (typeMatch) {
      propOptions.type = typeMatch[1].trim();
    }

    // Extract enum
    const enumMatch = propContent.match(/enum:\s*([^,\n}]+)/);
    if (enumMatch) {
      propOptions.enum = enumMatch[1].trim();
    }

    // Extract ref (for relationships)
    const refMatch = propContent.match(/ref:\s*['"]([^'"]+)['"]/);
    if (refMatch) {
      propOptions.ref = refMatch[1];
    } else {
      const refMatch2 = propContent.match(/ref:\s*([^,\n}]+)/);
      if (refMatch2) {
        propOptions.ref = refMatch2[1].trim();
      }
    }

    // Extract validation rules
    const validateMatch = propContent.match(/validate:\s*({[^}]+})/);
    if (validateMatch) {
      propOptions.validate = validateMatch[1];
    }

    // Extract other options
    propOptions.required = propContent.includes('required: true');
    propOptions.unique = propContent.includes('unique: true');
    propOptions.index = propContent.includes('index: true');

    // Extract default value
    const defaultMatch = propContent.match(/default:\s*([^,\n}]+)/);
    if (defaultMatch) {
      propOptions.default = defaultMatch[1].trim();
    }

    // Extract min/max for numbers
    const minMatch = propContent.match(/min:\s*([^,\n}]+)/);
    if (minMatch) propOptions.min = minMatch[1].trim();

    const maxMatch = propContent.match(/max:\s*([^,\n}]+)/);
    if (maxMatch) propOptions.max = maxMatch[1].trim();

    // Extract minlength/maxlength for strings
    const minLengthMatch = propContent.match(/minlength:\s*([^,\n}]+)/);
    if (minLengthMatch) propOptions.minlength = minLengthMatch[1].trim();

    const maxLengthMatch = propContent.match(/maxlength:\s*([^,\n}]+)/);
    if (maxLengthMatch) propOptions.maxlength = maxLengthMatch[1].trim();

    // Extract regex pattern
    const matchPattern = propContent.match(/match:\s*\/([^/]+)\//);
    if (matchPattern) propOptions.match = matchPattern[1];

    // ============================================
    // Determine field characteristics
    // ============================================
    const isArray = rawType.endsWith('[]') || propContent.includes('type: [');
    const isTypeScriptOptional = optionalMark === '?';
    const isMongooseRequired = propOptions.required;
    const isOptional = isTypeScriptOptional || !isMongooseRequired;

    // Determine TypeScript type
    let tsType = rawType;
    let enumType = propOptions.enum;
    let enumImport = null;

    // Check if rawType is an enum from imports
    if (!enumType && imports.enums.has(rawType)) {
      enumType = rawType;
    }

    // Get enum import info
    if (enumType && imports.enums.has(enumType)) {
      enumImport = imports.enums.get(enumType);
    }

    // Handle array types
    if (isArray) {
      if (rawType.endsWith('[]')) {
        const baseType = rawType.slice(0, -2);
        if (imports.enums.has(baseType)) {
          enumType = baseType;
          enumImport = imports.enums.get(baseType);
        }
      }
    }

    // Handle ref relationships
    let refType = null;
    let refImport = null;
    if (propOptions.ref) {
      // Try to find the referenced schema in imports
      const refName = propOptions.ref.replace(/Schema$/, '');
      if (imports.schemas.has(refName)) {
        refType = refName;
        refImport = imports.schemas.get(refName);
      } else if (imports.types.has(refName)) {
        refType = refName;
        refImport = imports.types.get(refName);
      }
    }

    // ============================================
    // Extract field documentation
    // ============================================
    let fieldComment = null;

    // Look for comments before the field
    const lines = schema.split('\n');
    const startIndex = fieldMatch.index;
    let lineIndex = 0;
    let currentIndex = 0;

    // Find which line contains the field definition
    for (let i = 0; i < lines.length; i++) {
      currentIndex += lines[i].length + 1; // +1 for newline
      if (currentIndex > startIndex) {
        lineIndex = i;
        break;
      }
    }

    // Look backward for comments
    let commentLines = [];
    for (let i = lineIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//')) {
        commentLines.unshift(line.substring(2).trim());
      } else if (line.includes('*/')) {
        // Start of block comment
        let blockComment = '';
        for (let j = i; j >= 0; j--) {
          const blockLine = lines[j];
          if (blockLine.includes('/**')) {
            // Extract the comment content
            blockComment = lines
              .slice(j, i + 1)
              .join('\n')
              .replace(/\/\*\*/, '')
              .replace(/\*\//, '')
              .replace(/\*/g, '')
              .trim();
            break;
          }
        }
        if (blockComment) {
          fieldComment = blockComment;
          break;
        }
      } else if (line === '' || line.includes('@')) {
        // Empty line or another decorator, stop looking
        if (commentLines.length > 0) {
          fieldComment = commentLines.join('\n');
        }
        break;
      } else {
        // Not a comment line, stop
        if (commentLines.length > 0) {
          fieldComment = commentLines.join('\n');
        }
        break;
      }
    }

    // ============================================
    // Determine field source based on decorators, comments, and patterns
    // ============================================
    let fieldSource = 'user';
    let isSystemGenerated = false;
    let isAutoGeneratedField = false;
    let isAuditField = false;

    // 1. Check decorators first (highest priority)
    if (hasAutoGenerated) {
      fieldSource = 'system';
      isSystemGenerated = true;
      isAutoGeneratedField = true;
    } else if (hasSystemField) {
      fieldSource = 'system';
      isSystemGenerated = true;
    } else if (hasDtoExclude) {
      fieldSource = 'exclude';
    } else if (hasUserInput) {
      fieldSource = 'user';
    } else {
      // 2. Check JSDoc tags in comments
      if (fieldComment) {
        if (
          fieldComment.includes('@system-generated') ||
          fieldComment.includes('@system')
        ) {
          fieldSource = 'system';
          isSystemGenerated = true;
        } else if (
          fieldComment.includes('@auto-generated') ||
          fieldComment.includes('@auto')
        ) {
          fieldSource = 'auto';
          isAutoGeneratedField = true;
        } else if (
          fieldComment.includes('@dto-exclude') ||
          fieldComment.includes('@exclude')
        ) {
          fieldSource = 'exclude';
        } else if (
          fieldComment.includes('@user-input') ||
          fieldComment.includes('@user')
        ) {
          fieldSource = 'user';
        }
      }

      // 3. Check field name patterns (lowest priority)
      if (fieldSource === 'user') {
        // System-generated identifier patterns
        const systemPatterns = [
          /^_id$/i,
          /^__v$/i,
          /^createdAt$/i,
          /^updatedAt$/i,
          /^deletedAt$/i,
        ];

        // Auto-generated business key patterns
        const businessKeyPatterns = [/Id$/i, /SysCode$/i, /Code$/i, /Key$/i];

        // Auto-generated timestamp patterns
        const autoPatterns = [/At$/i, /On$/i];

        // Audit/log fields
        const auditPatterns = [
          /^createdBy$/i,
          /^updatedBy$/i,
          /^deletedBy$/i,
          /By$/i,
        ];

        if (systemPatterns.some((pattern) => pattern.test(fieldName))) {
          fieldSource = 'system';
          isSystemGenerated = true;
        } else if (
          businessKeyPatterns.some((pattern) => pattern.test(fieldName)) &&
          propOptions.required &&
          propOptions.unique
        ) {
          fieldSource = 'system';
          isSystemGenerated = true;
        } else if (autoPatterns.some((pattern) => pattern.test(fieldName))) {
          fieldSource = 'auto';
          isAutoGeneratedField = true;
        } else if (auditPatterns.some((pattern) => pattern.test(fieldName))) {
          fieldSource = 'audit';
          isAuditField = true;
        }
      }
    }

    // ============================================
    // Determine DTO inclusion based on source
    // ============================================
    let dtoInclude = [];
    switch (fieldSource) {
      case 'user':
        dtoInclude = ['create', 'update', 'response', 'query'];
        break;
      case 'system':
        dtoInclude = ['response']; // Only in response DTOs
        break;
      case 'auto':
      case 'audit':
        dtoInclude = ['response']; // Only in response DTOs
        break;
      case 'exclude':
        dtoInclude = []; // Exclude from all DTOs
        break;
      default:
        dtoInclude = ['create', 'update', 'response', 'query'];
    }

    // Special rule: For query DTOs, include system fields only if they're searchable
    if (dtoInclude.includes('query') && fieldSource === 'system') {
      // For query DTOs, we might want to allow searching by ID
      if (
        fieldName.toLowerCase().includes('id') &&
        !fieldName.startsWith('_')
      ) {
        dtoInclude = ['response', 'query']; // Allow in query DTO for search
      }
    }

    // ============================================
    // Create comprehensive field object
    // ============================================
    const field = {
      name: fieldName,
      tsType: tsType,
      rawType: rawType,
      isOptional: isOptional,
      isArray: isArray,
      isRequired: isMongooseRequired,
      isUnique: propOptions.unique,
      hasIndex: propOptions.index,
      enumType: enumType,
      enumImport: enumImport,
      refType: refType,
      refImport: refImport,
      defaultValue: propOptions.default,
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

      // Field source detection
      source: fieldSource,
      isSystemGenerated: isSystemGenerated,
      isAutoGenerated: isAutoGeneratedField,
      isAuditField: isAuditField,
      dtoInclude: dtoInclude,
      hasAutoGeneratedDecorator: hasAutoGenerated,
      hasSystemFieldDecorator: hasSystemField,
      hasDtoExcludeDecorator: hasDtoExclude,
      hasUserInputDecorator: hasUserInput,

      // Field categories
      isIdField: fieldName.toLowerCase().includes('id') || fieldName === '_id',
      isTimestampField:
        fieldName === 'createdAt' ||
        fieldName === 'updatedAt' ||
        fieldName === 'deletedAt',
      isStatusField: fieldName === 'status',
      isReferenceField: !!propOptions.ref,
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
  // PHASE 4: Collect unique imports for DTOs
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
  // PHASE 5: Extract additional metadata
  // ============================================
  const schemaOptions = {
    timestamps: schema.includes('@Schema({ timestamps: true })'),
    collection: null,
  };

  // Extract collection name
  const collectionMatch = schema.match(
    /@Schema\([^)]*collection:\s*['"]([^'"]+)['"][^)]*\)/,
  );
  if (collectionMatch) {
    schemaOptions.collection = collectionMatch[1];
  }

  // ============================================
  // PHASE 6: Group fields by DTO type
  // ============================================
  const dtoFields = {
    create: fields.filter((f) => f.dtoInclude.includes('create')),
    update: fields.filter((f) => f.dtoInclude.includes('update')),
    response: fields.filter((f) => f.dtoInclude.includes('response')),
    query: fields.filter((f) => f.dtoInclude.includes('query')),
  };

  // ============================================
  // PHASE 7: Filter query fields (special logic)
  // ============================================
  // For query DTOs, we typically want a subset of fields
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

  // If no user-defined query fields, use defaults
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

    // Documentation
    classComment,
    classPurpose,
    classAudience,
    classNotes,

    // All fields
    fields,

    // Grouped by DTO type
    dtoFields,
    queryFields, // Special query fields

    // Field categories
    userInputFields: fields.filter((f) => f.source === 'user'),
    systemGeneratedFields: fields.filter((f) => f.source === 'system'),
    autoGeneratedFields: fields.filter((f) => f.source === 'auto'),
    excludedFields: fields.filter((f) => f.source === 'exclude'),

    idFields: fields.filter((f) => f.isIdField),
    requiredFields: fields.filter((f) => f.isRequired && !f.isOptional),
    optionalFields: fields.filter((f) => f.isOptional),
    enumFields: fields.filter((f) => f.enumType),
    refFields: fields.filter((f) => f.refType),
    arrayFields: fields.filter((f) => f.isArray),
    timestampFields: fields.filter((f) => f.isTimestampField),
    statusFields: fields.filter((f) => f.isStatusField),
    businessKeyFields: fields.filter((f) => f.isBusinessKey),
    searchableFields: fields.filter((f) => f.isSearchable),

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
