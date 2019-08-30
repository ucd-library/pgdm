const pg = require('./pg');
const config = require('./config');

class DependencyGraph {

    constructor() {
      this.graph = {};
      this.loadOrder = [];
    }

    async load() {
      this.graph = {};
      this.loadOrder = [];

      await this.addTablesToGraph(await this.getTables());


      let tmp = [];
      this.sortLoadOrder(tmp, this.loadOrder[0]);

      this.loadOrder = tmp; 
    }

    sortLoadOrder(sorted, table) {
      let depends = this.graph[table];

      if( depends.length === 0 ) {
        let next = this.addSorted(sorted, table);
        if( !next ) return;
        return this.sortLoadOrder(sorted, next);
      }

      let index = 0;
      for( let key of depends ) {
        let i = sorted.indexOf(key);
        if( i !== -1 ) {
          if( i > index-1 ) index = i+1;
          continue; // already added
        }
        this.sortLoadOrder(sorted, key);
        i = sorted.indexOf(key);
        if( i > index-1 ) index = i+1;
      }

      let next = this.addSorted(sorted, table, index);
      if( next ) this.sortLoadOrder(sorted, next);
    }

    addSorted(sorted, table, index) {
      if( sorted.indexOf(table) === -1 ) {
        if( index ) sorted.splice(index, 0, table);
        else sorted.push(table);
        this.loadOrder.splice(this.loadOrder.indexOf(table), 1);
      }

      if( this.loadOrder.length === 0 ) return null;
      return this.loadOrder[0];
    }

    async addTablesToGraph(tables) {
      for( let table of tables ) {
        if( this.loadOrder.indexOf(table) !== -1 ) continue;

        this.graph[table] = await this.loadTableDependencies(table);
        this.loadOrder.push(table);

        await this.addTablesToGraph(this.graph[table]);
      }
    }


    async loadTableDependencies(table) {
      let query = `SELECT
  tc.table_schema, 
  tc.constraint_name, 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='${table}';`;

      let foreignTables = await pg.query(query);

      return (foreignTables || [])
        .map(table => table.foreign_table_name)
        .filter(table => table !== 'source');
    }

    async getTables() {
      let tables = await pg.query(`select * from ${config.TABLES.PK}`);
      return tables.map(table => table.name);
    }

}

module.exports = DependencyGraph;