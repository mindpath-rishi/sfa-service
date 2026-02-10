const fs = require('fs');
const path = require('path');

exports.writeFileSafe = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log('📄', file);
};
