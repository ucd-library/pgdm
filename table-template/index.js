const fs = require('fs');
const path = require('path');

if( process.argv.length <= 2 ) {
  console.error('Please provide a table name');
  process.exit();
}

let tableName = process.argv[2];
let tableLetter = tableName.charAt(0);

// grab view parts
let viewArgs = {};
for( let i = 3; i < process.argv.length; i++ ) {
  let parts = process.argv[i].split('=');
  viewArgs[parts[0]] = parts[1].toUpperCase();
}

console.log('\nTable:');
console.log(tableName);
console.log('\nView Args:');
console.log(viewArgs);

let viewStarter = ''
let viewInsertMethodSig = '';
let viewUpdateMethodSig = [];
let trigInsertMethodSig = '';
let trigUpdateMethodSig = [];
let viewInsertSql = '';
let viewUpdateSql = [];
for( let viewArg in viewArgs ) {
  viewStarter += `      as ${viewArg},\n`;
  viewInsertMethodSig += `  ${viewArg} ${viewArgs[viewArg]},\n`;
  viewUpdateMethodSig.push(`  ${viewArg}_in ${viewArgs[viewArg]}`);

  trigInsertMethodSig += `    ${viewArg} := NEW.${viewArg},\n`;
  trigUpdateMethodSig.push(`    ${viewArg}_in := NEW.${viewArg}`);

  viewInsertSql += viewArg+', ';
  viewUpdateSql.push(viewArg+'_in');
}
viewUpdateMethodSig = viewUpdateMethodSig.join(',\n');
viewUpdateSql = viewUpdateSql.join(', ');
trigUpdateMethodSig = trigUpdateMethodSig.join(',\n');

function replace(tpl, key, value) {
  let re = new RegExp('{{'+key+'}}', 'g');
  return tpl.replace(re, value);
}

let tpl = fs.readFileSync(path.join(__dirname, 'table.tpl'), 'utf-8');
tpl = replace(tpl, 'tableName', tableName);
tpl = replace(tpl, 'tableLetter', tableLetter);
tpl = replace(tpl, 'viewStarter', viewStarter);
tpl = replace(tpl, 'viewInsertMethodSig', viewInsertMethodSig);
tpl = replace(tpl, 'viewUpdateMethodSig', viewUpdateMethodSig);
tpl = replace(tpl, 'viewInsertSql', viewInsertSql);
tpl = replace(tpl, 'viewUpdateSql', viewUpdateSql);
tpl = replace(tpl, 'trigInsertMethodSig', trigInsertMethodSig);
tpl = replace(tpl, 'trigUpdateMethodSig', trigUpdateMethodSig);

fs.writeFileSync(path.join(process.cwd(), tableName+'.sql'), tpl);