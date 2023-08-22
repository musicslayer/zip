# zip
Quick and easy nodejs functions to work with zip files.
 
This combines "node-compress-commons" and "buffer-crc32" to provide streamlined zip/unzip functionality that does not require any external modules.
 
https://github.com/archiverjs/node-compress-commons
 
https://github.com/brianloveswords/buffer-crc32

## API
> Zip.createZipFileFromFolder

Creates a zip file containing a folder and all of its content.

> Unzip.extractZipFileIntoFolder

Extracts a zip file, writing all of its contents into a specified folder.

> Unzip.readZipFile

Reads data from a zip file, returning a Map of file names to each file's information and uncompressed contents. This will not extract any files.


## Example Usage
```
const path = require("path");
const Zip = require("./js/Zip.js");
const Unzip = require("./js/Unzip.js");

const ZIP_FILE_PATH = path.resolve(path.join("example_zip_files", "archive.zip"));
const ZIP_SOURCE_FOLDER = path.resolve(path.join("example_zip_files", "files"));
const ZIP_DEST_FOLDER = path.resolve(path.join("example_zip_files", "extract"));

async function init() {
    // Create Zip
    await Zip.createZipFileFromFolder(ZIP_FILE_PATH, ZIP_SOURCE_FOLDER, 9);

    // Extract zip file contents into a new folder.
    await Unzip.extractZipFileIntoFolder(ZIP_FILE_PATH, ZIP_DEST_FOLDER);

    // Read zip file contents, but do not extract any files.
    let fileDataMap = await Unzip.readZipFile(ZIP_FILE_PATH);
    console.log(fileDataMap);
}
init();
```
