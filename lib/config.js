
class Config {

  constructor() {
    // hash of table/view name to UID column
    this.uids = {};
    this.tables = {};

    this.TABLES = {
      PK : 'tables',
      SOURCE : 'source'
    }
  }

}

module.exports = new Config();