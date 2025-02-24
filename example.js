const path = require("path");
const {Zip, Unzip} = require("@musicslayer/zip");

const ZIP_FILE_PATH = path.resolve(path.join(__dirname, "example_zip_files", "archive.zip"));
const ZIP_SOURCE_FOLDER = path.resolve(path.join(__dirname, "example_zip_files", "files"));
const ZIP_DEST_FOLDER = path.resolve(path.join(__dirname, "example_zip_files", "extract"));

async function init() {
    // Create Zip
    await Zip.createZipFileFromFolder(ZIP_FILE_PATH, ZIP_SOURCE_FOLDER, 9);

    // Compute Zip, but do not create any files.
    let compressedFileContent = await Zip.computeZipFile(ZIP_SOURCE_FOLDER, 9);
    console.log(compressedFileContent);

    // Extract zip file contents into a new folder.
    await Unzip.extractZipFileIntoFolder(ZIP_FILE_PATH, ZIP_DEST_FOLDER);

    // Read zip file contents, but do not extract any files.
    let fileDataMap = await Unzip.readZipFile(ZIP_FILE_PATH);
    console.log(fileDataMap);
}
init();