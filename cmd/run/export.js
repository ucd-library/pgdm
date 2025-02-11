const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const printError = require('./print-error');
const {model, pg, csv, source} = require('../..');

program
  .option('-c, --source [source name]', 'Name of source to export')
  .option('-a, --all [folder path]', 'Export all sheets to specified folder')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

(async function() {
  try {
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadConfig();

    if( program.source ) {
      let filepath = resolveFilePath(program.source);
      let result = await model.exportCsv(program.source, filepath);
      console.log(`${result.rows.length} rows exported into ${filepath}.csv from table: ${result.source.table_view}`);
    } else if( program.all ) {
      await model.exportAll(program.all);
    }

  } catch(e) {
    console.log('');
    printError(e);
  }

  process.exit();
})();