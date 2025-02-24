const fs = require("fs");
const path = require("path");

const ZipStream = require("./ZipStream.js");

class Zip {
    static async createZipFileFromFolder(zipFilePath, srcFolder, compressionLevel) {
        // Compresses the contents of a folder into a zip file.

        // If the zip file already exists, delete it up front to prevent any conflicts later.
        if(fs.existsSync(zipFilePath)) {
            fs.unlinkSync(zipFilePath);
        }
        
        let zipStream = new ZipStream(srcFolder, compressionLevel);
        await processDirectory(zipStream, srcFolder);
        zipStream.finish();
        writeFile(zipFilePath, zipStream.compressedFileContent);
    }

    static async computeZipFile(srcFolder, compressionLevel) {
        // Returns the compressed file information. This will not create any files.
        let zipStream = new ZipStream(srcFolder, compressionLevel);
        await processDirectory(zipStream, srcFolder);
        zipStream.finish();
        return zipStream.compressedFileContent;
    }
}

async function processDirectory(zipStream, dir) {
    // Recursively process the directory, adding any files found along the way to the zip file.
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

function writeFile(destFile, compressedFileContent) {
    // Write the file content.
    fs.writeFileSync(destFile, compressedFileContent);
}

module.exports = Zip;