const parse = require('csv-parse');
const stringify = require('csv-stringify');
const fs = require('fs');

class CSV {

  constructor() {
    this.REVISION_REGEX = /:r\d+$/;
  }

  /**
   * @method getData
   * 
   * @param {String} file file with path
   * 
   * @returns {Promise} 
   */
  getData(file) {
    let data = fs.readFileSync(file);

    return new Promise((resolve, reject) => {
      parse(data, (err, records) => {
        let headers = records.shift();

        let revision = null;
        let oldKey, newKey;
        if( headers.length && headers[0].match(this.REVISION_REGEX) ) {
          oldKey = headers[0];
          newKey = headers[0].replace(this.REVISION_REGEX, '');
          revision = parseInt(headers[0].match(this.REVISION_REGEX)[0].replace(/^:r/));
        }

        records = records.map(row => {
          let obj = {};
          headers.forEach((key, i) => {
            // replace revision header
            if( revision !== undefined && key === oldKey ) {
              key = newKey;
            }
            obj[key] = row[i];
          });
          return obj;
        });
        
        if( err ) reject(err);
        else resolve({records,revision});
      });
    });
  }

  async export(filename, data, revision, uid) {
    if( revision ) {
      data = data.map(item => {
        item[uid+':r'+revision] = item[uid];
        delete item[uid];
      });
    }

    let str = await this.stringify(data);
    fs.writeFileSync(filename+'.csv', str);
  }

  stringify(data) {
    return new Promise((resolve, reject) => {
      stringify(data, 
        {
          header: true,
          cast : {
            date : v => v.toISOString().replace(/T.*/, '')
          }
        }, 
        (err, data) => {
          if( err ) reject(err);
          else resolve(data);
        }
      )
    });
  }

}

module.exports = new CSV();