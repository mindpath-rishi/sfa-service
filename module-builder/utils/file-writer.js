const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

exports.writeFileSafe = async (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const ext = path.extname(file);

  const parserMap = {
    '.js': 'babel',
    '.ts': 'typescript',
    '.json': 'json',
    '.css': 'css',
    '.html': 'html',
    '.md': 'markdown',
  };

  const parser = parserMap[ext] || 'babel';

  try {
    const config = await prettier.resolveConfig(file);

    const formatted = await prettier.format(content, {
      ...config,
      parser,
    });

    fs.writeFileSync(file, formatted);
    console.log('📄 formatted:', file);
  } catch (error) {
    console.error('❌ Prettier failed, writing raw file:', file);
    console.error(error.message);

    // fallback → write raw content
    fs.writeFileSync(file, content);
  }
};
