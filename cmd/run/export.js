const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const {model, pg, csv, source} = require('../..');

program
  .option('-c, --source <source name>', 'Name of source to export')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

(async function() {
  try {
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadUids();

    let filepath = resolveFilePath(program.source);

    let result = await model.exportCsv(program.source, filepath);
    
    console.log(`${result.rows.length} rows exported into ${filepath}.csv from table: ${result.source.table_view}`);
  } catch(e) {
    console.log('');
    console.error(e.message);
  }

  process.exit();
})();