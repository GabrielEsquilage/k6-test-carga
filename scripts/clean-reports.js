const fs = require('fs');
const path = require('path');

const reportsDir = path.resolve(__dirname, '../reports');

if (fs.existsSync(reportsDir)) {
  const files = fs.readdirSync(reportsDir);

  files.forEach(file => {
    const filePath = path.join(reportsDir, file);

    if (fs.lstatSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  });

  console.log('🧹 Reports limpos com sucesso!');
} else {
  console.log('📁 Pasta reports não existe ainda.');
}