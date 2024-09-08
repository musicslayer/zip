# zip
Quick and easy nodejs functions to work with zip files.
 
This combines "node-compress-commons" and "buffer-crc32" to provide streamlined zip/unzip functionality that does not require any external modules.
 
https://github.com/archiverjs/node-compress-commons
 
https://github.com/brianloveswords/buffer-crc32

## Installation Instructions
npm install @musicslayer/zip

## Example Usage
Refer to example.js to see an example usage of each function in the API.

## API
> Zip.createZipFileFromFolder(zipFilePath, srcFolder, compressionLevel)

Creates a zip file containing a folder and all of its content. Compression level is an integer 0-9 refering to the zlib compression level:

0 = No compression<br/>
1 = Fastest Compression<br/>
...<br/>
9 = Maximum Compression

> Unzip.extractZipFileIntoFolder(zipFilePath, destFolder)

Extracts a zip file, writing all of its contents into a specified folder.

> Unzip.readZipFile(zipFilePath)

Reads data from a zip file, returning a Map of file names to each file's information and uncompressed contents. This will not extract any files.
