var program = require('commander');

program
  .version(require('../../package.json').version)
  .command('insert', 'Insert a csv or xslx file into a table or view')
  .command('update', 'Update a table or view with a exported csv')
  .command('delete', 'Remove all rows from source csv file')
  .command('replace', 'Replace all rows from source csv file')
  .command('export', 'Export source csv file with additional primary key column')
  .command('import-fs', 'Import all view folders from "pgdm export --all" command')
  .command('list', 'list all source files.  Filter by source name or view name.  Use \'*\' for wildcard match')
  .parse(process.argv);

if( !program.runningCommand ) {
  program.help();
}