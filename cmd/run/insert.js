const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const printError = require('./print-error');
const {model, pg, csv, source} = require('../..');
const cliProgress = require('cli-progress');

program
  .option('-f, --file <file>', 'Path to csv file')
  .option('-t, --table <table>', 'Table or view to insert into')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

let pbar;
let errors = [];

(async function() {
  let files = program.file.split(',');

  let pgOptions = getPgOptions(program);
  await pg.connect(pgOptions);

  await model.loadUids();

  pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
        
  model.on('insert-start', e => {
    pbar.start(e.total, 0)
  });
  model.on('insert-update', (e) => pbar.update(e.current));


  for( let file of files ) {
    if( !file ) continue;
    try {
        let filepath = resolveFilePath(file);
        let filename = model.checkAndGetFilename(filepath);

        let sheet = await csv.getData(filepath);
        let data = sheet.records;

        console.log(`\nInserting ${data.length} rows into ${program.table} from source: ${source.getSourceName(filename, program.sheet)}`);
        
        errors = await model.insert(filename, program.sheet, program.table, data, {revision: sheet.revision});
        
        pbar.stop();
    } catch(e) {
      console.log('');
      printError(e);
    }
  }

  try {
    await pg.client.end();
  } catch(e) {}

  process.exit();
})()