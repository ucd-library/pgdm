const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const {model, pg, csv, source} = require('../..');
const cliProgress = require('cli-progress');

program
  .option('-s, --source [source]', 'Path to csv or excel file')
  .option('-v, --view [view]', 'Required if excel file')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

let pbar;

(async function() {
  try {
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    
    let list = await model.list(program.source, program.view);
    console.log('source, view');
    list.forEach(row => console.log(row.name+', '+row.table_view));
    
  } catch(e) {
    console.log('');
    console.error(e.message);
  }

  process.exit();
})()