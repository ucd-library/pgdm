const XLSX = require('xlsx');

class Excel {

  getWorkbook(file) {
    if( !fs.existsSync(file) ) {
      throw new Error(`Unknown file: ${file}`);
    }
    return XLSX.readFile(file);
  }

  getSheetNames(workbook) {
    return workbook.SheetNames;
  }

  getSheetData(workbook, sheetname) {
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetname]);
  }


}

module.exports = new Excel();