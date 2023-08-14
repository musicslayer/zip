const path = require("path");
const Zip = require("./js/Zip.js");

const ZIP_SOURCE_FOLDER = path.resolve(path.join("example_zip_files", "files"));
const ZIP_FILE_PATH = path.resolve(path.join("example_zip_files", "file.zip"));

async function init() {
    await Zip.createZipFileFromFolder(ZIP_FILE_PATH, ZIP_SOURCE_FOLDER, 9);
}
init();