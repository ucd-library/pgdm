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
        if( err ) return reject(err);
        let headers = records.shift();

        let revision = null;
        let oldKey, newKey;
        if( headers.length && headers[0].match(this.REVISION_REGEX) ) {
          oldKey = headers[0];
          newKey = headers[0].replace(this.REVISION_REGEX, '');
          revision = parseInt(headers[0].match(this.REVISION_REGEX)[0].replace(/^:r/, ''));
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

  async export(filename, data, columns, revision, uid) {
    if( revision !== undefined ) {
      let ruid = uid+':r'+revision;
      data = data.map(item => {
        item[ruid] = item[uid];
        delete item[uid];
        return item;
      });
      columns.forEach(col => {
        if( col.key === uid ) col.key = ruid;
      });

      uid = ruid;
    }

    let str = await this.stringify(data, columns);
    fs.writeFileSync(filename+'.csv', str);
  }

  stringify(data, columns) {
    return new Promise((resolve, reject) => {
      stringify(data, 
        {
          columns,
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