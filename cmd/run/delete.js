const program = require('commander');
const inquirer = require('inquirer');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const {model, pg} = require('../..');

program
  .option('-c, --source <name>', 'Name of source to remove')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

(async function() {
  try {
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadUids();

    let info = await model.analyzeDelete(program.source);

    let answer = await inquirer.prompt([{
      type : 'confirm',
      name : 'proceed',
      default : false,
      message: `Are you sure you want to delete source: ${program.source}?
This operation will delete ${info.count} rows from ${info.table}.`
    }]);
    if( !answer.proceed ) process.exit();

    await model.delete(program.source);
  } catch(e) {
    console.error('\n'+e.message);
  }

  process.exit();
})();