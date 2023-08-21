const path = require("path");
const Zip = require("./js/Zip.js");
const Unzip = require("./js/Unzip.js");

const ZIP_FILE_PATH = path.resolve(path.join("example_zip_files", "archive.zip"));
const ZIP_SOURCE_FOLDER = path.resolve(path.join("example_zip_files", "files"));
const ZIP_DEST_FOLDER = path.resolve(path.join("example_zip_files", "extract"));

async function init() {
    await Zip.createZipFileFromFolder(ZIP_FILE_PATH, ZIP_SOURCE_FOLDER, 9);
    await Unzip.unzipFileIntoFolder(ZIP_FILE_PATH, ZIP_DEST_FOLDER, 9);
}
init();