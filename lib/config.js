
class Config {

  constructor() {
    // hash of view name to UID column
    this.uids = {};
    // hash of view name to table column
    this.tables = {};

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