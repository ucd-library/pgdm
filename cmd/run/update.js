const program = require('commander');
const inquirer = require('inquirer');
const wrapPgOptions = require('../utils/wrapPgOptions');
const checkRequired = require('../utils/checkRequired');
const getPgOptions = require('../utils/getPgOptions');
const resolveFilePath = require('../utils/resolveFilePath');
const {model, pg, csv, source} = require('../..');
const cliProgress = require('cli-progress');
const clc = require("cli-color");

program
  .option('-f, --file <file>', 'Path to csv exported file')
  .option('-d, --dry-run', 'Analyze update but do not preform.')
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
    await model.loadUids();
    
    let data = await csv.getData(filepath);
 
    let info = await model.analyzeUpdate(filename, null, data);

    if( program.dryRun ) {
      let updateInfo = clc.xterm(202)(await csv.stringify(info.updates.map(row => row.new)));
      let insertInfo = clc.blue(await csv.stringify(info.inserts));
      let deleteInfo = clc.red(await csv.stringify(info.deletes));
      
      console.log(`The following updates will be preformed on ${info.source.table_view}:
      
** Row Updates : ${info.updates.length} **
${updateInfo}

** Row Inserts : ${info.inserts.length} **
${insertInfo}

** Row Deletes : ${info.deletes.length} **
${deleteInfo}
`);
      process.exit();
    }

    let answer = await inquirer.prompt([{
      type : 'confirm',
      name : 'proceed',
      default : false,
      message: `The following updates will be preformed on ${info.source.table_view}:
      
 - Update Row Count : ${info.updates.length}
 - Add Row Count    : ${info.inserts.length}
 - Delete Row Count : ${info.deletes.length}

Are you sure you want to proceed?`
    }]);


    if( !answer.proceed ) process.exit();
    
    pbar = new cliProgress.Bar({etaBuffer: 50}, cliProgress.Presets.shades_classic); 
    
    let total = 0;
    model.on('start', (e) => {
      total = e.length;
      pbar.start(e.length, 0)
    });
    model.on('update', (e) => pbar.update(e.current));
    
    await model.update(info);
    
    console.log(`\n${total} rows updated in ${info.source.table_view} from source: ${info.source.name}`);
  } catch(e) {
    console.error(e);
  }

  process.exit();
})();