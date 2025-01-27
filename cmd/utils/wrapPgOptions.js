module.exports = cmd => {
  cmd
    .option('-e, --pg-schema [schema]', 'Name of PG schema to use')  
    .option('-s, --pg-service [service]', 'Name of PG service from ~/.pg_service.conf file')
    .option('-u, --pg-user [user]', 'Name of PG User account')
    .option('-p, --pg-password [password]', 'PG user password')
    .option('-h, --pg-host [host]', 'PG host')
    .option('-d, --pg-database [database]', 'Name of PG database to use')
    .option('-P, --pg-port [port]', 'PG port to use')
    .option('-l, --pg-sslmode', 'Set sslmode connection to PG.  \'disable\' or \'require\' supported')
    .option('--pgdm-source-table [table]', 'Name of table to store source file information')
    .option('--pgdm-list-table [table]', 'Name of table to store list of tables available to pgdm')
}