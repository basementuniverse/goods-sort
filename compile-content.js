const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, '/content/content.json');
const outputPath = path.join(__dirname, '/content/content-compiled.json');

const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

const compiledContent = content.map(item => {
  if (item.type === 'json') {
    const jsonPath = path.join(__dirname, '/content', item.args[0]);
    try {
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return {
        ...item,
        args: [jsonData],
      };
    } catch (err) {
      console.error(`Error reading JSON file ${jsonPath}:`, err);
      return item;
    }
  }
  return item;
});

fs.writeFileSync(outputPath, JSON.stringify(compiledContent, null, 2));
console.log('Content compiled successfully to content-compiled.json');
