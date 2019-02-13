var program = require('commander');

program
  .version(require('../../package.json').version)
  .command('insert', 'Insert a csv or xslx file into a table or view')
  .command('update', 'Update a table or view with a exported csv')
  .command('export', 'Export source csv file with additional primary key column')
  .command('list', 'list all source files.  Filter by source name or view name.  Use \'*\' for wildcard match')
  .command('delete', 'Delete rows from source csv or excel file')
  .parse(process.argv);

if( !program.runningCommand ) {
  program.help();
}