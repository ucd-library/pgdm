
class Config {

  constructor() {
    // hash of view name to UID column
    this.uids = {};
    // hash of view name to table column
    this.tables = {};
    // has of tables to delete from view
    this.deleteFromView = {};

    this.nameToViewMap = {};

    /**
     * Main PGDM tables
     */
    this.TABLES = {
      PK : 'tables',
      SOURCE : 'source'
    }
  }

}

module.exports = new Config();