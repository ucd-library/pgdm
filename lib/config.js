
class Config {

  constructor() {
    // hash of view name to UID column
    this.uids = {};
    // hash of view name to table column
    this.tables = {};
    // has of tables to delete from view
    this.deleteFromView = {};

    this.nameToViewMap = {};

    this.custom = {};

    /**
     * Main PGDM tables
     */
    this.TABLES = {
      TABLE_CONFIG : 'pgdm_table_config',
      PK : 'pgdm_tables',
      SOURCE : 'pgdm_source'
    }
  }

  getCustomProperty(table, key) {
    if( !this.custom[table] ) return null;
    return this.custom[table][key];
  }

}

module.exports = new Config();