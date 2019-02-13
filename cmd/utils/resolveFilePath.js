const path = require('path');
const os = require('os');

module.exports = filepath => {
  if( filepath.match(/^~/) ) {
    filepath = filepath.replace(/^~/, os.homedir());
  } else if( !filepath.match(/^\//) ) {
    filepath = path.resolve(process.cwd(), filepath);
  }
  return filepath;
}