const camelCase = require('camelcase');

module.exports = cmd => {
  for( let option of cmd.options ) {
    if( !option.required ) continue;
    let cc = camelCase(option.long);
    if( !cmd[cc] ) {
      console.error(`error: missing required option '${option.flags}'\n`);
      cmd.help();
      process.exit(-1);
    }
  }
}