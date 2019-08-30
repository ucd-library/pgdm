const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const printError = require('./print-error');
const {model, pg, csv, source} = require('../..');
const cliProgress = require('cli-progress');

program
  .option('-f, --folder [folder path]', 'Folder from "pgdm export --all"')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

let pbar;


(async function() {
  try {
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadUids();

    let total = 0;
    // model.on('update-start', e => {
    //   pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
    //   total = e.total;
    //   pbar.start(e.total, 0)
    // });
    // model.on('update-update', (e) => pbar.update(e.current));
    // model.on('update-end', () => pbar.update(total));

    model.on('insert-start', e => {
      pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
      total = e.total;
      pbar.start(e.total, 0)
    });
    model.on('insert-update', (e) => pbar.update(e.current));
    model.on('insert-end', () => pbar.e);

    await model.importAll(program.folder);

  } catch(e) {
    console.log('');
    printError(e);
  }

  process.exit();
})();