const fs = require("fs");
const path = require("path");

const UnzipStream = require("./UnzipStream.js");

class Unzip {
    static async extractZipFileIntoFolder(zipFilePath, destFolder) {
        // Extracts the contents of a zip file into the destination folder.
        let unzipStream = new UnzipStream(zipFilePath);
        await unzipStream.extractFiles();
        writeFiles(destFolder, unzipStream.fileDataMap);
    }

    static async readZipFile(zipFilePath) {
        // Return a map with the uncompressed file information.
        let unzipStream = new UnzipStream(zipFilePath);
        await unzipStream.extractFiles();
        return unzipStream.fileDataMap;
    }
}

function writeFiles(destFolder, fileDataMap) {
    for(let fileData of fileDataMap.values()) {
        // Create any neccessary folders and then write the file content.
        let destPath = path.join(destFolder, fileData.name);
        let fileParts = destPath.split(path.sep);
        let fileFolder = path.join(...fileParts.slice(0, -1));
        fs.mkdirSync(fileFolder, { recursive: true });
        fs.writeFileSync(destPath, fileData.uncompressedFileContent);
    }
}

module.exports = Unzip;