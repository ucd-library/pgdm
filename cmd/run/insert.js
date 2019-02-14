const program = require('commander');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const {model, pg, csv, source} = require('../..');
const cliProgress = require('cli-progress');

program
  .option('-f, --file <file>', 'Path to csv or excel file')
  .option('-e, --sheet [sheetname]', 'Required if excel file')
  .option('-t, --table <table>', 'Table or view to insert into')
wrapPgOptions(program);  

program
  .parse(process.argv);

checkRequired(program);

let pbar;

(async function() {
  try {
    let filepath = resolveFilePath(program.file);
    let filename = model.checkAndGetFilename(filepath);
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadUids();

    let data = (await csv.getData(filepath)).records;

    pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
    
    model.on('start', () => {
      console.log(`\nInserting ${data.length} rows into ${program.table} from source: ${source.getSourceName(filename, program.sheet)}`);
      pbar.start(data.length, 0)
    });
    model.on('insert', (e) => pbar.update(e.current));
    
    await model.insert(filename, program.sheet, program.table, data);
    
    pbar.stop();
    
  } catch(e) {
    console.log('');
    console.error(e.message);
  }

  process.exit();
})()