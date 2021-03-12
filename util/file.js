const fs = require('fs');
const path = require('path');

exports.clearImage = filePath => {
  const imagePath = path.join(__dirname, '..', filePath);
  fs.unlink(imagePath, err => console.log(err));
};
