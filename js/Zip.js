const fs = require("fs");
const path = require("path");

const ZipStream = require("./ZipStream.js");

class Zip {
    static async createZipFileFromFolder(zipFilePath, srcFolder, compressionLevel) {
        // If the zip file already exists, delete it up front to prevent any conflicts later.
        if(fs.existsSync(zipFilePath)) {
            fs.unlinkSync(zipFilePath);
        }

        // Recursively process the directory, adding any files found along the way to the zip file.
        let zipStream = new ZipStream(zipFilePath, srcFolder, compressionLevel);
        await processDirectory(zipStream, srcFolder);
        zipStream.finish();
    }
}

async function processDirectory(zipStream, dir) {
    let items = fs.readdirSync(dir);
    for(let item of items) {
        let itemPath = path.join(dir, item);

        let stats = fs.lstatSync(itemPath);
        if(stats.isDirectory()) {
            await processDirectory(zipStream, itemPath);
        }
        else {
            await zipStream.addFile(itemPath);
        }
    }
}

module.exports = Zip;