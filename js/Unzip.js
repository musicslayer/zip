const fs = require("fs");
const path = require("path");

const UnzipStream = require("./UnzipStream.js");

class Unzip {
    static async unzipFileIntoFolder(zipFilePath, destFolder, compressionLevel) {
        // Extracts a zip file into a folder.
        let unzipStream = new UnzipStream(zipFilePath, compressionLevel, destFolder);
        await unzipStream.extractFiles();
    }
}

module.exports = Unzip;