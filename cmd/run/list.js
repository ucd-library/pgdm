const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const {sprintf} = require('sprintf-js');
const {model, pg, csv, source} = require('../..');


program
  .option('-s, --source [source]', 'Path to csv or excel file')
  .option('-v, --view [view]', 'Required if excel file')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

(async function() {
  try {
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    
    let list = await model.list(program.source, program.view);
    
    let maxNameLength = 5;
    let maxViewLength = 5;
    list.forEach(row => {
      if( row.name.length > maxNameLength ) maxNameLength = row.name.length;
      if( row.table_view.length > maxViewLength ) maxViewLength = row.table_view.length;
    });

    let format = `%-${maxNameLength}s | %s`;
    console.log(sprintf(format, 'source', 'view'));

    let brk = '';    
    for( let i = 0; i < maxNameLength; i++ ) brk += '-';
    brk += '-+-';
    for( let i = 0; i < maxViewLength; i++ ) brk += '-';
    console.log(brk);

    list.forEach(row => console.log(sprintf(format, row.name, row.table_view)));
    
  } catch(e) {
    console.log('');
    console.error(e.message);
  }

  process.exit();
})()