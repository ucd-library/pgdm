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
let errors = [];

(async function() {
  try {
    let filepath = resolveFilePath(program.file);
    let filename = model.checkAndGetFilename(filepath);
    let pgOptions = getPgOptions(program);

    await pg.connect(pgOptions);
    await model.loadUids();

    let data = (await csv.getData(filepath)).records;

    pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
    
    model.on('insert-start', () => {
      console.log(`\nInserting ${data.length} rows into ${program.table} from source: ${source.getSourceName(filename, program.sheet)}`);
      pbar.start(data.length, 0)
    });
    model.on('insert-update', (e) => pbar.update(e.current));
    
    errors = await model.insert(filename, program.sheet, program.table, data);
    
    pbar.stop();
    
  } catch(e) {
    console.log('');
    console.error(e.message);
    if( e.info ) {
      if( e.info.row ) console.log('  row: '+e.info.row);
      if( e.info.uid ) console.log('  uid: '+e.info.uid);
    }
  }

  // errors.forEach(e => {
  //   console.error(e.message);
  //   if( e.info ) {
  //     if( e.info.row ) console.log('  row: '+e.info.row);
  //     if( e.info.uid ) console.log('  uid: '+e.info.uid);
  //   }
  // });

  process.exit();
})()