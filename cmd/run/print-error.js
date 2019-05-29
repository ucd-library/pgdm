let format = require('./format-error');
module.exports = e => {
  console.error(format(e));
}