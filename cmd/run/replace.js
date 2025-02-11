const program = require('commander');
const inquirer = require('inquirer');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const {model, pg, csv, source} = require('../..');
const printError = require('./print-error');
const cliProgress = require('cli-progress');

program
  .option('-f, --file <file>', 'Path to csv file')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

(async function() {
  try {
    let filepath = resolveFilePath(program.file);
    let filename = model.checkAndGetFilename(filepath);
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadConfig();
    
    let data = await csv.getData(filepath);

    pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
    
    let total = 0;
    model.on('replace-start', (e) => {
      total = e.length;
      pbar.start(e.length, 0)
    });
    model.on('replace-update', (e) => pbar.update(e.current));

    await model.replace(filename, data);
    let s = await source.getSource(sourceName);

    console.log(`\n${total} rows INSERTED in ${s.table_view} from source: ${filename}`);
  } catch(e) {
    console.log('');
    printError(e);
  }

  process.exit();
})();