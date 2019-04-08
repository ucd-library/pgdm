const fs = require('fs');
const path = require('path');

if( process.argv.length <= 2 ) {
  console.error('Please provide a table name');
  process.exit();
}

let tableName = process.argv[2];
let tableLetter = tableName.charAt(0);

function replace(tpl, key, value) {
  let re = new RegExp('{{'+key+'}}', 'g');
  return tpl.replace(re, value);
}

let tpl = fs.readFileSync(path.join(__dirname, 'table.tpl'), 'utf-8');
tpl = replace(tpl, 'tableName', tableName);
tpl = replace(tpl, 'tableLetter', tableLetter);

fs.writeFileSync(path.join(process.cwd(), tableName+'.sql'), tpl);